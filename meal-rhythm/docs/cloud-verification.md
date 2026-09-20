# 无 Mac 环境下的云端验证

更新：2026-09-20。

## 仓库与目录

- 用户授权公开的仓库：[ai-agent-bootcamp](https://github.com/fengr1326-dot/ai-agent-bootcamp)。
- 应用分支：[codex/meal-rhythm-ios](https://github.com/fengr1326-dot/ai-agent-bootcamp/tree/codex/meal-rhythm-ios)。原有 `main` 分支及根目录 README 保留，没有强制覆盖或自动合并。
- 云端应用位于 `meal-rhythm/`；进入该目录后运行 README 中的安装、测试和启动命令。
- GitHub 实际执行仓库根目录 `.github/workflows/meal-rhythm.yml`。应用内 `.github/workflows/verify.yml` 保留为独立应用仓库的工作流，不会在子目录内自行触发。
- 上传内容只有已跟踪的源代码、测试、开发配置示例及技术文档，不包含本机 `.env`、数据库、用户记录、令牌或原始产品 DOCX。

## 自动检查

每次推送应用分支后，GitHub Actions 分别运行：

1. Linux：依赖安装与漏洞审计、真实 PostgreSQL 迁移、包括 Redis 队列在内的自动测试、接口生成一致性、Docker 镜像构建。
2. macOS：生成 Xcode 项目，启动开发 API，编译 Swift 6 应用，在 iPhone 模拟器执行 XCTest 与 XCUITest，保存测试报告。

[查看运行记录](https://github.com/fengr1326-dot/ai-agent-bootcamp/actions)。只有同一次运行的两个任务都成功，才算这一版本云端验证通过。编译成功不能代替测试成功，静态语法检查不能代替 Xcode 编译。

## 已发现并修复的问题

- 新检出代码的 CRLF 换行影响契约断言与 Swift 条件编译检查：已兼容两种换行并补回归。
- 并发幂等重放原本仍写入同一个账号，导致事务冲突连锁发生：无变化时不再写入，冲突采用有上限的退避重试；耗尽时返回可重试的 503。
- Swift 6 禁止将通知框架的非 Sendable 请求对象传过执行隔离边界：在框架回调内提取不可变字符串，只传递通知标识。

事务隔离及冲突错误参考 [Prisma 6 官方事务文档](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)。这里保留 Serializable 隔离，没有降低一致性要求来通过测试。

## 与安装到手机的区别

当前工作流使用模拟器，不需要 Apple 签名证书，也不会生成可直接安装到真机的发行包。TestFlight、真机签名、Apple 登录能力与正式服务部署属于后续独立验收环节，需要用户控制的 Apple 开发者身份和配置。没有购买服务、修改仓库可见性或启用收费构建配置。

真实相机、权限、弱网、系统通知、供应商识别质量和营养数据专业审核仍需单独完成；正式发布限制继续保留。最新结果见 [实施状态](implementation-status.md) 和 [测试记录](testing.md)。
