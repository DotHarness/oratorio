[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Assert-Exists {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }
}

function Replace-Regex {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Replacement,
        [switch]$Singleline,
        [switch]$Multiline
    )

    $options = [System.Text.RegularExpressions.RegexOptions]::None
    if ($Singleline) { $options = $options -bor [System.Text.RegularExpressions.RegexOptions]::Singleline }
    if ($Multiline) { $options = $options -bor [System.Text.RegularExpressions.RegexOptions]::Multiline }

    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($Content, $Pattern, $options)) {
        throw "Pattern not found: $Pattern"
    }

    return [System.Text.RegularExpressions.Regex]::Replace($Content, $Pattern, $Replacement, $options)
}

function Set-OrAddXmlElement {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$ElementName,
        [Parameter(Mandatory = $true)][string]$NewVersion
    )

    $existingPattern = "<$ElementName>[^<]+</$ElementName>"
    if ([System.Text.RegularExpressions.Regex]::IsMatch($Content, $existingPattern)) {
        return Replace-Regex -Content $Content -Pattern $existingPattern -Replacement "<$ElementName>$NewVersion</$ElementName>"
    }

    $insertPattern = '(<PropertyGroup>[\s\S]*?)(\r?\n\s*</PropertyGroup>)'
    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($Content, $insertPattern)) {
        throw "Pattern not found: first PropertyGroup in XML project file"
    }

    return [System.Text.RegularExpressions.Regex]::Replace(
        $Content,
        $insertPattern,
        ('$1' + "`r`n    <$ElementName>$NewVersion</$ElementName>" + '$2'),
        [System.Text.RegularExpressions.RegexOptions]::Singleline,
        [TimeSpan]::FromSeconds(5))
}

function Update-XmlVersionFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$NewVersion
    )

    Assert-Exists -Path $Path
    $content = [System.IO.File]::ReadAllText($Path)
    $content = Set-OrAddXmlElement -Content $content -ElementName "AssemblyVersion" -NewVersion $NewVersion
    $content = Set-OrAddXmlElement -Content $content -ElementName "Version" -NewVersion $NewVersion
    Write-Utf8NoBomFile -Path $Path -Content $content
}

function Update-PackageJsonVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$NewVersion
    )

    Assert-Exists -Path $Path
    $content = [System.IO.File]::ReadAllText($Path)
    $content = Replace-Regex -Content $content -Pattern '("version"\s*:\s*")[^"]+(")' -Replacement ('${1}' + $NewVersion + '${2}')
    Write-Utf8NoBomFile -Path $Path -Content $content
}

function Update-NpmLockRootAndWorkspace {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RootName,
        [Parameter(Mandatory = $true)][string]$NewVersion
    )

    Assert-Exists -Path $Path
    $content = [System.IO.File]::ReadAllText($Path)

    $rootPattern = '(^\s*\{\s*"name"\s*:\s*"' + [System.Text.RegularExpressions.Regex]::Escape($RootName) + '"\s*,\s*"version"\s*:\s*")[^"]+(")'
    $content = Replace-Regex -Content $content -Pattern $rootPattern -Replacement ('${1}' + $NewVersion + '${2}') -Singleline -Multiline

    $workspacePattern = '(""\s*:\s*\{[\s\S]*?"name"\s*:\s*"' + [System.Text.RegularExpressions.Regex]::Escape($RootName) + '"[\s\S]*?"version"\s*:\s*")[^"]+(")'
    $content = Replace-Regex -Content $content -Pattern $workspacePattern -Replacement ('${1}' + $NewVersion + '${2}') -Singleline

    Write-Utf8NoBomFile -Path $Path -Content $content
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Version is required. Example: 0.1.2"
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid version '$Version'. Expected format: X.Y.Z"
}

$repoRoot = Split-Path -Parent $PSScriptRoot

$targets = @(
    @{ Type = "xml"; Path = "server/Oratorio.Server.csproj" },
    @{ Type = "packageJson"; Path = "desktop/package.json" },
    @{ Type = "npmLock"; Path = "desktop/package-lock.json"; Name = "oratorio-desktop" }
)

$updatedFiles = New-Object System.Collections.Generic.List[string]

foreach ($target in $targets) {
    $relativePath = $target.Path
    $absolutePath = Join-Path $repoRoot $relativePath
    Write-Host "Updating $relativePath -> $Version"

    switch ($target.Type) {
        "xml" {
            Update-XmlVersionFile -Path $absolutePath -NewVersion $Version
        }
        "packageJson" {
            Update-PackageJsonVersion -Path $absolutePath -NewVersion $Version
        }
        "npmLock" {
            Update-NpmLockRootAndWorkspace -Path $absolutePath -RootName $target.Name -NewVersion $Version
        }
        default {
            throw "Unknown target type: $($target.Type)"
        }
    }

    $updatedFiles.Add($relativePath) | Out-Null
}

Write-Host ""
Write-Host "Version bump completed: $Version"
Write-Host "Updated files:"
foreach ($path in $updatedFiles) {
    Write-Host " - $path"
}

