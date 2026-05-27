---
layout: page
title: Oratorio
description: 让 Agent 在看板中与你一同协作项目。由 DotCraft 驱动。
aside: false
sidebar: false
editLink: false
lastUpdated: false
---

<div class="or-home">
  <section class="or-hero">
    <div class="or-hero__inner">
      <div class="or-hero__content">
        <div class="or-hero__brand">
          <span class="or-brand-mark">
            <img src="../assets/oratorio-logo.svg" alt="Oratorio" />
            <svg class="or-wand-overlay" viewBox="225 190 640 640" aria-hidden="true" focusable="false">
              <g transform="translate(128 128) scale(.75)">
                <path class="or-wand-aura" d="M808 606 896 294" />
                <ellipse class="or-wand-orbit-halo" cx="852" cy="450" rx="106" ry="35" transform="rotate(-74 852 450)" />
                <circle class="or-wand-expanding-halo" cx="896" cy="294" r="48" />
                <circle class="or-wand-expanding-halo secondary" cx="896" cy="294" r="40" />
                <path class="or-wand-body-halo" d="M808 606 896 294" />
                <path class="or-wand-core" d="M808 606 896 294" />
                <circle class="or-wand-tip-glow" cx="896" cy="294" r="42" />
                <g class="or-wand-spark">
                  <path d="M896 214v48" />
                  <path d="M872 238h48" />
                </g>
                <g class="or-wand-spark secondary">
                  <path d="M942 260v34" />
                  <path d="M925 277h34" />
                </g>
              </g>
            </svg>
          </span>
          <span class="or-hero__brand-text">
            <strong>Oratorio</strong>
            <small>指挥你的 agent</small>
          </span>
        </div>
        <h1>让 agent <span class="or-hero__accent">听你指挥。</span></h1>
        <p class="or-hero__tagline">让 Agent 在看板中与你一同协作项目。由 DotCraft 驱动。</p>
        <p class="or-hero__lead">
          Oratorio 把本地任务、GitHub 与 GitLab 的 Issue 和 PR/MR 收进同一张看板。Agent 在这里接活、在隔离环境中完成，再把结果交回到你手里。
        </p>
        <div class="or-actions">
          <a class="or-button or-button--primary" href="./getting-started">快速开始</a>
          <a class="or-button" href="https://github.com/DotHarness/oratorio/releases">下载 Release</a>
          <a class="or-button" href="https://github.com/DotHarness/oratorio">GitHub</a>
        </div>
        <div class="or-hero__chip-rail" aria-label="工作从哪儿来">
          <span>GitHub Issue 与 PR</span>
          <span>GitLab Merge Request</span>
          <span>本地任务</span>
          <span>由 DotCraft 驱动</span>
        </div>
      </div>
      <figure class="or-hero__media">
        <div class="or-hero__frame">
          <img src="https://github.com/DotHarness/resources/raw/master/oratorio/board-light.png" alt="Oratorio Desktop 看板，多张任务在各列之间流动" />
        </div>
      </figure>
    </div>
  </section>

  <section class="or-section or-section--quiet">
    <div class="or-section__inner">
      <div class="or-prereq">
        <div>
          <p class="or-kicker">由 DotCraft 驱动</p>
          <h3>一个早已熟悉你项目的 AI Agent。</h3>
          <p>
            Oratorio 负责看板，<a href="https://dotharness.github.io/dotcraft/">DotCraft</a> 才是真正干活的那位 Agent —— 它住在你的项目里，记得每一次对话，学会项目专属的 Skill 和插件，通过 MCP 调用本地工具，并接到你选定的模型。
          </p>
          <p>
            先在 DotCraft 里把项目准备好，再让 Oratorio 接上来。之后你每交出一张卡片，接活的 Agent 都已经熟知项目的来龙去脉。
          </p>
          <div class="or-actions">
            <a class="or-button or-button--primary" href="https://dotharness.github.io/dotcraft/zh/getting-started">5 分钟装好 DotCraft ↗</a>
            <a class="or-button" href="./dotcraft-workspaces">Oratorio 如何接入</a>
          </div>
        </div>
        <ol class="or-prereq__steps">
          <li><b>1</b><span>安装 DotCraft，在你的项目中打开它。</span></li>
          <li><b>2</b><span>选定模型，发一条试聊消息 —— Agent 的"家"就准备好了。</span></li>
          <li><b>3</b><span>在 Oratorio 中指向同一个项目，开始把工作交给 Agent。</span></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="or-section">
    <div class="or-section__inner">
      <div class="or-section__header">
        <h2>一张看板，把 Agent 的工作清晰地铺开。</h2>
        <p class="or-section__text">
          Oratorio 把界面收得很克制：一张看板、一栏侧边状态、几个关键操作。详细的对话、计划与文件改动留在 DotCraft 中 —— 在看板里一键就能跳过去。
        </p>
      </div>
      <div class="or-grid">
        <article class="or-card">
          <div class="or-card__media">
            <img src="https://github.com/DotHarness/resources/raw/master/oratorio/board-columns.png" alt="看板各列之间流转的卡片" />
          </div>
          <div class="or-card__body">
            <span class="or-card__index">01 · 看板</span>
            <h3>谁都看得懂的看板</h3>
            <p>把卡片拖给 Agent 即可派活。它会从"新任务"走到"进行中"，再到"等你过目"。结果落定后，下一步怎么走由你决定。</p>
          </div>
        </article>
        <article class="or-card">
          <div class="or-card__media">
            <img src="https://github.com/DotHarness/resources/raw/master/oratorio/task-drawer-dark.png" alt="侧边栏展示当前工作的状态" />
          </div>
          <div class="or-card__body">
            <span class="or-card__index">02 · 侧边栏</span>
            <h3>Agent 的工作进度一目了然</h3>
            <p>点开任意卡片，就能看到 Agent 当前所在步骤、相关链接、以及看板内可用的操作。想看完整对话？一键跳进 DotCraft。</p>
          </div>
        </article>
        <article class="or-card">
          <div class="or-card__media">
            <img src="https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-review-dark.png" alt="带建议的审阅总结" />
          </div>
          <div class="or-card__body">
            <span class="or-card__index">03 · 审阅</span>
            <h3>判定权始终在你手里</h3>
            <p>Agent 完成工作后，会留给你一份书面总结和逐行建议。通过、要求修改或作废 —— 每一次都由你拍板。</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="or-section or-section--quiet">
    <div class="or-section__inner or-showcase or-showcase--reverse">
      <div>
        <p class="or-kicker">GitHub · GitLab · 本地任务</p>
        <h2>从你已有的工作来源里直接拉过来。</h2>
        <p class="or-section__text">
          接上一个 GitHub 或 GitLab 项目，Oratorio 会把 Issue、PR、MR 同步成卡片 —— 默认只读，需要时再启用回写。不想接外部来源？自己写一张本地任务，流程完全一样。
        </p>
        <div class="or-actions">
          <a class="or-button or-button--primary" href="./getting-started">跟着步骤走一遍</a>
          <a class="or-button" href="./configuration">配置参考</a>
          <a class="or-button" href="./gitlab">GitLab 指南</a>
        </div>
      </div>
      <figure class="or-media">
        <img src="https://github.com/DotHarness/resources/raw/master/oratorio/board-card-closeup.png" alt="卡片上的来源标签特写" />
      </figure>
    </div>
  </section>

  <section class="or-section">
    <div class="or-section__inner or-showcase">
      <div>
        <p class="or-kicker">默认安全</p>
        <h2>Agent 在隔离环境中工作，你的分支不会被动到。</h2>
        <p class="or-section__text">
          Agent 在一份独立的项目副本里完成工作，你正在用的分支不会被动到一行。Agent 把结果交回来之后，下一步怎么走由你决定 —— 合并、推到 PR、要求再来一遍，或先放到一边。
        </p>
        <div class="or-actions">
          <a class="or-button or-button--primary" href="./getting-started#dispatch">从头到尾走一遍</a>
          <a class="or-button" href="./local-support">离线能跑什么</a>
        </div>
      </div>
      <figure class="or-media">
        <img src="https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-analysis-dark.png" alt="Agent 正在分析任务" />
      </figure>
    </div>
  </section>

  <section class="or-section or-section--quiet">
    <div class="or-section__inner">
      <div class="or-section__header">
        <h2>三步从安装到第一次交活。</h2>
        <p class="or-section__text">先给项目装好 DotCraft，再用 Oratorio 接上来，你就可以交出第一张卡片了。</p>
      </div>
      <div class="or-steps">
        <div class="or-step">
          <strong>给项目装好 DotCraft</strong>
          <span>在 DotCraft 里打开项目，完成首次设置。选定模型、发一条试聊消息 —— Agent 的"家"就准备好了。</span>
        </div>
        <div class="or-step">
          <strong>在 Oratorio 中接入项目</strong>
          <span>打开 Oratorio 的 Settings，把它指向你刚才设置的同一个项目。一个字段、一次保存。</span>
        </div>
        <div class="or-step">
          <strong>交出第一张卡片</strong>
          <span>从 Issue 列表里挑一张，或者自己写一张，丢到看板上，Agent 就接过去开始干活。</span>
        </div>
      </div>
    </div>
  </section>

  <section class="or-section or-section--final">
    <div class="or-section__inner">
      <div class="or-cta">
        <h2>准备好登上指挥台了吗？</h2>
        <p>五分钟，从零到一张能用的看板，包含 DotCraft 设置在内。之后每接入一个项目，都自动套上这同一套流程：Agent 干活、你拍板。</p>
        <div class="or-actions">
          <a class="or-button or-button--primary" href="./getting-started">快速开始</a>
          <a class="or-button" href="https://github.com/DotHarness/oratorio">在 GitHub 上点 Star</a>
        </div>
      </div>
    </div>
  </section>
</div>
