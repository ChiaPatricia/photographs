# Jia — Photographs

**https://luckyjiaxu.com/photographs/**

A photography archive that builds itself from a Google Drive folder. Words and sequences live in
`content/`; photographs stay in Drive and are never modified.

---

## 照片在哪里 · Where the photographs live

Google Drive 里的照片文件夹（由 GitHub 的 `DRIVE_FOLDER` secret 指定，不写在代码里）：

```
Drive folder/
  01-leaves/      → Turning 转色
  02-animals/     → Cache 藏
  03-light/       → Glitter 波光
  04-places/      → Still 还在
    _hold/        → 以 _ 开头的文件夹不会出现在网站上（备选、重复的照片放这里）
  照片.jpg         → 顶层的照片是“收件箱”：不显示，除非 collections.yaml 里点名
```

不在 Drive 里的照片（比如从 luckyjiaxu.com 拿来的几张）放在仓库的 `extra/<文件夹名>/` 里，
和 Drive 里同名文件夹的照片合在一起。

现在 Drive 里的 75 张照片还都在顶层，网站按 `content/collections.yaml` 里列出的文件名取用其中 28 张。
想在 Drive 里也按文件夹整理好：打开 `tools/organize-drive.gs`，按文件开头的四步在 script.google.com
运行一次（只移动文件，不复制、不删除，分享链接不变）。

## 加新照片 · Adding photographs

1. 放进 Drive 里对应的文件夹。
2. 网站每天自动更新一次；想马上更新：GitHub → Actions → **Publish** → **Run workflow**。

新照片会按拍摄时间排在这一组最后，大小和位置自动安排（不会连着两张满屏、竖片会配对）。
想决定它的位置和大小，在 `content/collections.yaml` 的 `sequence` 里写上文件名和 `layout`。

网站用的是自动生成的版本：AVIF（多个尺寸）+ JPEG 备用，颜色按原图的色彩空间（Adobe RGB / Display P3）
正确转换，拍摄信息里的 GPS 不会公开。

## 改文字 · Words

| 改什么 | 在哪里 |
| --- | --- |
| 每组的一个词、那一句话（中英各一） | `content/collections.yaml` → `word`、`sentence` |
| 每张照片的地点、注释、替代文字 | 同一文件 → `photos` |
| 名字、封面候选、关于页、联系方式 | `content/site.yaml` |
| 界面上的词（目录、关于、别处……） | `src/lib/i18n.ts` |

所有词和句子现在都是 `status: draft`（暂定），确认后改成 `final`。依据和备选见 [CURATION.md](CURATION.md)。

## 藏起来的细节 · Things that are found, not announced

- 首页是一堆可以拖动的照片（手机上是一叠，可以左右滑）；最上面那张是拍摄时间最接近访客此刻的。
- 每张小照片角上都有老数码相机那种橙色日期戳。
- 在大图里停留约 7 秒，有些照片会多出一行字。
- 「别处」会带你去一张还没看过的照片（只记在访客自己的浏览器里）。
- 在「藏」这一组，鼠标冲得太快，照片会轻轻躲开；慢慢靠近就不会。
- 键盘：← → 切换，`i` 详情，`e` 别处，`Esc` 关闭。手机：左右滑切换，下拉关闭，长按看详情。

## 本地预览 · Working locally

需要 Node 22.12 或更新。

```bash
npm install
```

```bash
npm run sync
```

```bash
npm run content
```

```bash
npm run dev
```

然后打开 http://localhost:4321/photographs/ 。`npm run sync` 需要 `.env` 里有 `DRIVE_FOLDER=…`；
没有的话 `npm run content` 会用本地的 `photography/` 文件夹。

| 命令 | 做什么 |
| --- | --- |
| `npm run sync` | 把 Drive 文件夹同步到 `.cache/drive/`（只下载新的或改过的） |
| `npm run photos` | 生成网页用的图片和 `src/data/archive.json` |
| `npm run fonts` | 把思源宋体裁成网站实际用到的几十个字 |
| `npm run build` | 以上两步 + 生成整个网站到 `dist/` |

## 发布 · Publishing

推送到 `main` 就会自动构建并发布（`.github/workflows/publish.yml`，GitHub Pages）。

Secrets（仓库 Settings → Secrets and variables → Actions）：

- `DRIVE_FOLDER` — 必需。Drive 文件夹分享链接里 `/folders/` 后面那一串。
- `GOOGLE_SERVICE_ACCOUNT` 或 `GOOGLE_API_KEY` — 可选，更稳定。用 service account 的话，Drive 文件夹可以改成
  不公开（只分享给这个 service account 的邮箱），原图就不会被任何拿到链接的人下载。

注意：

- Drive 文件夹现在是「知道链接的任何人都可以查看」，原图可以被下载。建议之后改用 service account。
- GitHub 会在公开仓库 60 天没有提交后暂停定时任务，到 Actions 页面点一下重新启用即可。

## 结构 · How it is made

- Astro（静态网站）+ 少量原生 JavaScript（约 7 KB gzip），没有框架运行时。
- `scripts/build-photos.mjs` — 颜色管理（为没有嵌入色彩描述的 Canon Adobe RGB 文件补上配置文件）、
  按内容哈希缓存、AVIF/JPEG 多尺寸、模糊占位图、拍摄时间校正（Canon 的时钟快了 12 小时）。
- `src/lib/compose.ts` — 把一组照片排成有节奏的序列：满屏、大、中、小、成对。
- `src/scripts/viewer.ts` — 从原位置展开的大图、键盘与手势、历史记录、延迟出现的信息。
- 字体：Newsreader、Hanken Grotesk、思源宋体（按需裁剪，自托管，不连接 Google）。
