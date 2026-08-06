# TRACECRAFT · 设计智能平台

TRACECRAFT 是一个可本地运行的需求分析与设计评审平台。它将原始需求、结构化分析、待确认项、设计稿、评审结论和反馈优化串联在同一条可追溯证据链中，帮助产品、设计与评审团队更高效地协作。

> 当前项目主要用于本地演示和能力验证。正式部署前，请替换默认账号密码，并完善 HTTPS、权限控制、密钥管理、数据库与审计能力。

## 核心能力

- 上传和编辑 Markdown、DOCX 需求材料
- 执行需求分析、重新分析和历史版本恢复
- 管理待确认项及其回复、忽略和恢复状态
- 上传 HTML、JPG、PNG 设计稿并保存版本记录
- 生成设计评审意见、符合性结论和问题记录
- 建立评审意见采纳与反馈优化闭环
- 查看月度、产品维度和采纳率统计
- 支持管理员与普通用户角色
- 未配置 API Key 时提供内置演示模式

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Element Plus
- 后端：Node.js、Express
- 文档处理：Mammoth、JSZip、SheetJS
- 自动化验证：Playwright、Vue TypeScript Compiler
- 数据存储：本地 JSON 文件和上传目录

## 快速开始

### 环境要求

- Node.js 20+
- npm 10+
- Python 3（DOCX 完整结构提取和本地 Skill 校验需要）

### 安装与启动

```powershell
npm install
npm run dev
```

启动后访问：

- 前端开发地址：`http://127.0.0.1:5173`
- 后端服务地址：`http://127.0.0.1:4318`

本地演示账号：

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 普通用户 | `user` | `user123` |

## 生产构建

```powershell
npm install
npm run build
npm run server
```

默认访问地址为 `http://127.0.0.1:4318`。

## 模型配置

登录后可在“模型设置”页面配置 API Key、模型名称和服务地址。服务端通过兼容 OpenAI Responses API 的接口执行需求分析、设计评审和反馈优化。

也可以通过环境变量提供 API Key：

```powershell
$env:OPENAI_API_KEY="your-api-key"
npm run dev
```

常用环境变量：

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 模型服务 API Key | 空，使用演示模式 |
| `PORT` | 后端服务端口 | `4318` |
| `DIP_DATA_DIR` | 本地数据存储目录 | `.data` |
| `DIP_PYTHON` | 指定 Python 可执行文件 | 自动探测 |
| `ADMIN_USERNAME` | 管理员账号 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `USER_USERNAME` | 普通用户账号 | `user` |
| `USER_PASSWORD` | 普通用户密码 | `user123` |

## 可用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动前端开发服务器和后端服务 |
| `npm run build` | 执行类型检查并构建生产版本 |
| `npm run server` | 单独启动后端服务 |
| `npm run preview` | 预览 Vite 构建结果 |
| `npm run check` | 执行 Vue/TypeScript 类型检查 |
| `npm run pipeline-smoke` | 执行需求分析链路冒烟测试 |
| `npm run review-pipeline-smoke` | 执行设计评审链路冒烟测试 |
| `npm run skill-runner-smoke` | 执行本地 Skill Runner 冒烟测试 |
| `npm run visual-check` | 执行桌面端与移动端视觉检查 |

## 项目结构

```text
.
├─ src/                     # Vue 前端页面、组件和类型
├─ server/                  # Express API、分析与评审流程
│  ├─ skills/               # 分析、评审及反馈优化 Skill
│  └─ local-skills/         # 项目内置的本地 Skill
├─ ux-award-case-output/    # 项目案例和相关交付材料
├─ package.json             # 依赖与运行命令
└─ vite.config.ts           # Vite 配置
```

## 本地数据与安全

运行数据默认保存在 `.data/`：

- `db.json`：需求、版本、评审和反馈记录
- `secrets.json`：本地模型密钥配置
- `uploads/`：上传的需求文档和设计稿
- `feedback/`：反馈与优化运行记录

`.data/`、`node_modules/`、构建产物、日志和测试输出已通过 `.gitignore` 排除。请勿将生产密钥或包含敏感业务信息的材料提交到公开仓库。

## 当前状态

本项目处于 MVP 阶段，主要面向本地运行、流程演示与设计智能能力验证。目前使用本地文件保存数据，尚未提供面向生产环境的多租户、细粒度权限、集中式数据库和高可用部署方案。

## 许可证

本仓库暂未声明开源许可证。在添加许可证前，默认保留全部权利。
