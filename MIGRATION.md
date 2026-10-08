# 溪棠的照片墙 — 迁移交接文档

> 给接手的 AI / 开发者：本文件描述项目结构、外部依赖、数据位置，以及搬到新平台需要替换的代码点。请保持 UI 与功能原样，只替换存储层。

## 1. 技术栈

- Next.js 16（App Router）+ React 19 + Tailwind CSS v4，包管理器 pnpm
- 数据库：PostgreSQL（当前托管在 Neon），驱动 `pg`，连接串环境变量 `DATABASE_URL`
- 文件存储：Vercel Blob（`@vercel/blob`），环境变量 `BLOB_READ_WRITE_TOKEN`
- 认证：自研密码门（`lib/auth.ts`），密码以 scrypt 哈希存于 `settings` 表，cookie 会话；不依赖第三方
- 其它：`@vercel/analytics`（可直接删除，见第 5 节）

启动：`pnpm install && pnpm build && pnpm start`（需 Node 20+）。

## 2. 数据在哪里

| 数据 | 位置 |
| --- | --- |
| 照片/视频（原图 + 高清压缩图 + 缩略图三份）、音乐、留言图片 | Vercel Blob，数据库中存的是完整 URL |
| 照片元数据、收藏、回收站、备注、旋转、私密、月份代表图、首页代表图、留言、音乐列表、访客记录、密码哈希 | PostgreSQL |

表结构见 `scripts/schema.sql`（导出自线上库，可直接在新库执行）。

关键表：
- `photos`：`hash`（内容 SHA-256，用于去重）、`phash`（感知哈希，相似照片识别）、`original_url / display_url / thumb_url`、`month`（YYYY-MM）、`kind`（image/video）、`favorite`、`deleted_at`（回收站）、`rotation`、`private`
- `month_covers`、`settings`（含密码哈希与首页代表图）、`messages`、`tracks`、`visitors`

## 3. 导出现有数据（在旧环境执行一次）

```bash
set -a && source <你的 .env 文件> && set +a
node scripts/export-data.mjs ./export
```

会生成：
- `export/db/*.json`：每张表一个 JSON
- `export/files/<原路径>`：Blob 中全部文件，保留原始路径
- `export/manifest.json`：旧 URL → 相对路径的对照表（用于改写数据库中的 URL）

## 4. 需要替换的代码（只有存储层）

所有用到 `@vercel/blob` 的位置：

| 文件 | 用途 | 替换为 |
| --- | --- | --- |
| `app/api/upload/route.ts` | `handleUpload`：给浏览器签发直传凭证，并校验管理员 | 生成 S3 预签名 PUT URL 的接口（返回 uploadUrl + 最终公开 URL） |
| `lib/upload-queue.ts` | 浏览器端 `upload()` 直传照片三份文件，带进度/暂停/取消 | 用 `XMLHttpRequest` PUT 到预签名 URL（`upload.onprogress` 保留进度；`xhr.abort()` 实现取消） |
| `components/gallery/music-player.tsx` | 管理员上传音乐 | 同上 |
| `components/gallery/guestbook.tsx` | 留言上传图片/涂鸦 | 同上 |
| `lib/cleanup.ts`、`app/api/tracks/[id]/route.ts`、`app/api/messages/[id]/route.ts` | `del()` 删除文件 | S3 `DeleteObject(s)` |
| `app/api/storage/route.ts` | `list()` 统计已用空间 | S3 `ListObjectsV2` 累加 Size，或直接 `SUM(size)` 查数据库 |

注意：
- 文件名是内容寻址的（含哈希），永不覆盖，可设 `Cache-Control: public, max-age=31536000, immutable`。
- 新存储桶需开启 CORS，允许站点域名 `PUT`，并暴露 `ETag`。
- 收藏照片受保护的逻辑在 SQL 里（`favorite = true` 的不会被清理），迁移时不要改动。

## 5. 推荐目标平台（≥500G）

- 文件：Cloudflare R2（S3 兼容、无流量费）、阿里云 OSS / 腾讯云 COS（国内访问快）、Backblaze B2。都按量付费，500G 无上限问题。
- 数据库：数据量很小（几 MB），继续用 Neon 免费版即可；或换 Supabase / 任意 PostgreSQL / 服务器自建。
- 运行环境：任意支持 Node 的平台（Railway、Render、Zeabur、自己的 VPS + PM2）。也可以继续部署在 Vercel，只换存储。
- 删除 `app/layout.tsx` 中的 `<Analytics />` 和 `@vercel/analytics` 依赖（离开 Vercel 后无用）。
- `next.config.mjs` 中如有图片域名白名单，改成新存储桶域名。

## 6. 导入步骤

1. 新库执行 `scripts/schema.sql`。
2. 把 `export/files/` 整个上传到新存储桶（保持路径，如 `rclone copy` / `aws s3 sync`）。
3. 依据 `export/manifest.json` 把 `export/db/*.json` 中所有旧 URL 替换为 `新桶公开域名/相对路径`（涉及字段：`photos.original_url/display_url/thumb_url`、`messages.image_url`、`tracks.url`），再插入新库。各表 `id` 保持不变，并在插入后执行 `SELECT setval(pg_get_serial_sequence('photos','id'), (SELECT MAX(id) FROM photos));`（messages、tracks 同理）。
4. 配置环境变量：`DATABASE_URL`，以及新存储的 Access Key / Secret / Bucket / Endpoint / 公开域名。
5. `settings` 表原样导入，密码保持不变。

## 7. 验收清单

访客/管理员登录与切换 · 上传（去重、进度、暂停、取消、失败重试）· 月份墙计数 · 灯箱旋转并保存 · 收藏墙缩放拖拽 · 私密照片对访客不可见 · 首页代表图 · 留言（文字/涂鸦/图片）· 音乐增删与播放 · 回收站 30 天 · 相似/重复清理 · 存储空间统计。
