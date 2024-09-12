# Calendar-Alerts

# 环境信息

Node.js V20.12.2

# 打包


```bash
sudo npm run build #打包
```

使用以上命令打包时，Build 产物会自动上传到github的 Release，需要修改 package.json 的 version 属性

## build 配置自动发布到github
1. 需要 github 访问令牌 token ：https://github.com/settings/tokens/new ，应具有 repo 范围/权限
```json
{
    "build": {
        "publish": [
            {
                "provider": "github",                               //表示发布到github
                "owner": "ericzzhou",                               // 个人id
                "repo": "calendar-app",                             // git仓库名
                "private": true,                                    // 是否私有仓库
                "token":"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"  //github tonken(至少拥有 repo 权限)
            }
        ],
    }
}
```
2. 如果不想在 package.json 文件中显式指定github token，可定义系统环境变量：GH_TOKEN:xx

# 自动更新

自动更新使用 [electron-updater](https://www.electron.build/auto-update) 包
- 不需要专用的发布服务器。
- 代码签名验证不仅在 macOS 上，而且在 Windows 上。
- 所有必需的元数据文件和构件都会自动生成和发布。
- 所有平台都支持下载进度和分阶段部署。
- 开箱即用地支持不同的提供商：（GitHub Releases、Amazon S3、DigitalOcean Spaces、Keygen 和通用 HTTP（s） 服务器）。
- 您只需要 2 行代码即可使其工作。

# 补充其他

- 安装包位置：C:\Users\ericz\AppData\Local\Programs\calendar-app
- 自动更新下载目录：C:\Users\ericz\AppData\Local\calendar-app-updater