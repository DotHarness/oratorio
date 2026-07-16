using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Oratorio.Server.DotCraft;

namespace Oratorio.Server.Tests;

public sealed class OratorioBindingMcpRuntimeTests
{
    [Fact]
    public async Task Initialize_requires_the_binding_bearer()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var runtime = new OratorioBindingMcpRuntime(services.GetRequiredService<IServiceScopeFactory>());
        runtime.Issue("binding-1", 1);
        var context = Request("initialize", bearer: "wrong");

        await runtime.HandleAsync(context, "binding-1");

        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task Initialize_returns_board_identity_instructions_and_an_isolated_session()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var runtime = new OratorioBindingMcpRuntime(services.GetRequiredService<IServiceScopeFactory>());
        var bearer = runtime.Issue("binding-1", 7);
        var context = Request("initialize", bearer);

        await runtime.HandleAsync(context, "binding-1");

        context.Response.Body.Position = 0;
        using var response = await JsonDocument.ParseAsync(context.Response.Body);
        Assert.Equal("oratorio.board", response.RootElement.GetProperty("result").GetProperty("serverInfo").GetProperty("name").GetString());
        Assert.Equal(AppServerDynamicToolCatalog.BoardNamespaceDescription,
            response.RootElement.GetProperty("result").GetProperty("instructions").GetString());
        Assert.False(string.IsNullOrWhiteSpace(context.Response.Headers["Mcp-Session-Id"]));
    }

    private static DefaultHttpContext Request(string method, string bearer)
    {
        var json = JsonSerializer.Serialize(new
        {
            jsonrpc = "2.0",
            id = 1,
            method,
            @params = new { protocolVersion = "2025-06-18" }
        });
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.Headers.Authorization = $"Bearer {bearer}";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(json));
        context.Response.Body = new MemoryStream();
        return context;
    }
}
