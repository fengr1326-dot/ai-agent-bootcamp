# 餐时 · Meal Rhythm

iOS 优先的每日饮食节奏与营养记录开发原型。SwiftUI 客户端 + NestJS/Fastify 开放 HTTP 接口 + 可替换视觉服务。

**这是开发原型，不是可上架版本。** 食物目录为明确标注的示例数据，营养规则尚未经过专业审核。服务在 `NODE_ENV=production` 下主动拒绝启动。Windows 已运行后端与契约测试，iOS 构建、相机和系统通知还需要 Mac / 真机验收。详细边界见 [实施状态](docs/implementation-status.md)。

## 1. 在 Windows 启动后端

使用 Node.js 24。首次安装：

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run verify
$env:ALLOW_GUEST = "true"
npm.cmd start
```

默认地址 `http://127.0.0.1:3000`。健康检查：`GET /v1/health`，接口说明：`GET /v1/openapi.json`。默认以本机文件保存账号，位置 `.data/accounts`，重启后数据仍在；没有配置数据库也可以完整体验手动记录。

没有 `AUTH_SECRET` 时，开发服务每次启动使用随机临时密钥。若希望重启后继续使用原账号会话，请在本机 `.env` 设置至少 32 字符的随机密钥，勿提交此文件。复制 `.env.example` 后填写自己的配置，用以下方式加载：

```powershell
node --env-file=.env dist/apps/api/src/main.js
```

初次启动必须将 `ALLOW_GUEST=true` 明确设为开发配置。此入口不是生产登录方式。演示账号仍经过令牌鉴权和账号隔离，不是共享的匿名全局数据。

## 2. 在 Mac 运行 iOS App

需要 Xcode 16 或更新版本、iOS 17+ 模拟器和 XcodeGen。首先在同一台 Mac 按上节安装并启动后端（将 `npm.cmd` 换成 `npm`，环境变量使用 `export ALLOW_GUEST=true`）。然后：

```sh
brew install xcodegen
cd apps/ios
xcodegen generate
open MealRhythm.xcodeproj
```

选择 `MealRhythm` scheme 和一个 iPhone 模拟器，运行 Debug 构建。点击“以开发体验账号开始”，完成五步设置，在“我的”中确认过敏与忌口，然后开始手动记录。开发账号按钮只出现在 Debug 构建。

- 模拟器默认连接 `http://localhost:3000`。
- 真机或远程后端：修改 `apps/ios/Info.plist` 的 `API_BASE_URL` 为实际 HTTPS 地址；不要把正式版本配置成明文 HTTP。
- Apple 登录：配置自己的 Bundle ID、开发团队、Sign in with Apple capability 和服务端 `APPLE_CLIENT_ID`。私钥与签名材料不能提交。
- 相机不可用或识别服务未配置时，“直接手动记录”始终可用。
- 项目由 `project.yml` 生成。不要把开发团队、证书和个人 Xcode 配置写进共享模板。

回到仓库根目录运行 iOS 测试（将设备名改为本机已有模拟器）：

```sh
xcodebuild test -project apps/ios/MealRhythm.xcodeproj -scheme MealRhythm \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
```

UI 测试需要本机后端已经启动。仓库包含对应的 macOS CI 配置，但提交配置不等于已通过 Mac 构建。

## 3. 可替换的识别 API

后端只要求兼容的 `chat/completions` HTTP 协议，不绑定模型品牌。设置：

```text
VISION_API_URL=https://your-provider.example/v1/chat/completions
VISION_API_KEY=<server-side-only>
VISION_MODEL=<your-model-id>
```

文字识别只需要上述配置。照片识别还需要 `S3_BUCKET`、`S3_REGION`，以及存储凭据；S3 兼容服务可另填 `S3_ENDPOINT`。桶必须保持私有，禁止公开照片 URL。正式使用前必须确认供应商对照片的保留、训练使用和部署区域的条款；客户端的同意开关不能替代供应商侧的数据保护配置。

流程：申请短期上传地址 → 上传压缩且移除位置元数据的照片 → 创建识别任务 → 轮询 → 用户修正食物/份量 → 明确确认“已吃”。AI 只能返回目录中存在的食物，不能直接提供营养值。未配置、超时、未知食物均显示失败，绝不伪造识别成功。

本机开发模式在 API 进程内处理任务。Redis 配置存在时，必须同时运行 `npm run worker`；API 只负责入队，Worker 执行识别。开发本机模式不承诺任务在进程异常退出后的自动恢复。

## 4. 数据库与队列联调

Windows 没有 Docker 时，可以直接运行真实 PostgreSQL 测试：

```powershell
npm.cmd run test:postgres
```

命令使用项目级 PostgreSQL 17 二进制，创建随机端口、随机密码的临时测试实例，只监听回环地址，不安装系统服务、不修改系统账户、不读取现有数据库连接。执行真实迁移和 5 项集成测试后关闭实例，并在校验路径后清理本次测试目录。该方式已在 Windows 验证；Redis 仍需要 Docker / WSL 或独立测试服务，不能用模拟对象冒充验证通过。

首次安装包含约 100 MB 的平台数据库二进制，来源与版本在 package-lock.json 锁定。它是开发测试依赖，不是生产数据库部署方式。

已经提供 PostgreSQL 迁移、Redis 队列适配器和仅用于本地联调的 Compose 文件，需要自行安装 Docker 后运行：

```sh
# 先设置随机 AUTH_SECRET；不要使用文档里的固定字符串作为密钥。
docker compose -f infra/compose.yml up --build
```

所有映射端口只绑定回环地址。Compose 不附带公网发布、生产证书或真实 AI 密钥。数据库密码仅用于此隔离的本地容器示例，不能用于远程服务。

要运行真实基础设施测试，使用独立的测试数据库，禁止指向真实用户数据库：

```text
DATABASE_URL=postgresql://<test-user>:<test-password>@localhost:5432/mealrhythm_test
TEST_DATABASE_URL=<same-disposable-test-database>
TEST_REDIS_URL=redis://localhost:6379
```

```sh
npx prisma migrate deploy
npm run verify
```

普通验证未配置 `TEST_DATABASE_URL` / `TEST_REDIS_URL` 时，5 项 PostgreSQL 测试和 1 项 Redis 测试明确跳过；其他测试照常执行。`npm run test:postgres` 会自行创建独立数据库并运行这 5 项 PostgreSQL 测试，不需要手工提供数据库地址。

## 5. 接口和同步约定

- 路径统一以 `/v1` 开头。所有私有接口需要 `Authorization: Bearer <accessToken>`。
- 私有写入需要 `Idempotency-Key`，同一请求重试必须用相同 key 和内容。服务端保留 24 小时幂等结果；iOS 超过 23 小时的模糊写入会暂停，请用户核对后处理，避免重复记餐。
- 计划餐不计入摄入；确认“已吃”后才计算营养和下一餐窗口。修改餐次需要最新 `revision`，冲突不能静默覆盖。
- 时刻使用带时区的 ISO 8601；一天以用户起床—睡眠区间计算，支持跨午夜。
- 本机待同步数据以账号隔离。网络失败保留请求；业务冲突暂停队列，并在“我的 · 待同步”展示原因。
- Swift 接口路径/方法从同一份契约生成，完整响应结构公开在 OpenAPI；Swift 值模型目前手工维护，由服务端生成的响应样本做解码回归。
- `/v1/auth/apple` 是第一方登录；本版没有第三方 OAuth 授权、scope 或开发者管理后台。任何受授权的 HTTP 客户端可使用接口，但不能把第一方用户令牌公开分发。

重新生成契约、Swift 路由绑定和测试样本：

```sh
npm run contracts
npm run verify
```

## 6. 仓库结构

```text
apps/ios/             SwiftUI、相机、离线队列、XCTest / XCUITest
apps/api/             HTTP、鉴权、事务持久化、识别适配器
apps/worker/          Redis 识别任务消费者
packages/domain/     输入模型、示例食物目录
packages/rules/      动态窗口、范围估算、约束过滤、提醒规则
packages/contracts/ OpenAPI 和移动端共享响应样本
prisma/              PostgreSQL schema 与迁移
infra/               本地 Docker 联调
tests/               规则、真实 HTTP、识别与数据库回归
docs/                产品技术方案、实施状态和测试记录
```

每一批功能更改必须补充测试、完成可执行验证并提交 Git commit。未能在当前环境运行的测试必须明确记录，不以静态检查冒充真机或模拟器验收。
