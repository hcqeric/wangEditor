/*
    上传视频
*/

import { objForEach, arrForEach, percentFormat } from '../../util/util.js'
import Progress from './progress.js'
import { UA } from '../../util/util.js'

// 构造函数
function UploadVideo(editor) {
  this.editor = editor;
}

// 原型
UploadVideo.prototype = {
  constructor: UploadVideo,
  // 根据 debug 弹出不同的信息
  _alert: function _alert(alertInfo, debugInfo) {
    const editor = this.editor;
    const debug = editor.config.debug;
    // var debug = true;
    const customAlert = editor.config.customAlert;

    if (debug) {
      throw new Error('wangEditor: ' + (debugInfo || alertInfo));
    } else {
      if (customAlert && typeof customAlert === 'function') {
        customAlert(alertInfo);
      } else {
        alert(alertInfo);
      }
    }
  },
  //插入视频的方法  需要单独定义
  insertLinkVideo:function(link){
    if (!link) {
      return;
    }
    const editor = this.editor;
    const config = editor.config;

    // 校验格式
    const linkVideoCheck = config.linkVideoCheck;
    let checkResult
    if (linkVideoCheck && linkVideoCheck === 'function') {
      checkResult = linkVideoCheck(link);
      if (typeof checkResult === 'string') {
        // 校验失败，提示信息
        alert(checkResult);
        return;
      }
    }
    editor.cmd.do('insertHTML', '<video src="' + link + '" style="max-width:100%;" controls autobuffer muted/>');

    // 验证视频 url 是否有效，无效的话给出提示
    let video = document.createElement('video');
    video.onload = function () {
      const callback = config.linkVideoCallback;
      if (callback && typeof callback === 'function') {
        callback(link);
      }

      video = null;
    };
    video.onerror = function () {
      video = null;
      // 无法成功下载图片
      this._alert('插入视频错误', 'wangEditor: \u63D2\u5165\u56FE\u7247\u51FA\u9519\uFF0C\u56FE\u7247\u94FE\u63A5\u662F "' + link + '"\uFF0C\u4E0B\u8F7D\u8BE5\u94FE\u63A5\u5931\u8D25');
      return;
    };
    video.onabort = function () {
      video = null;
    };
    video.src = link;
  },
  // 上传视频
  uploadVideo: function uploadVideo(files) {
    
    if (!files || !files.length) {
      return;
    }

    // ------------------------------ 获取配置信息 ------------------------------
    const editor = this.editor;
    const config = editor.config;
    let uploadVideoServer = config.uploadVideoServer;
    const maxSize = 100 * 1024 * 1024;       //100M
    const maxSizeM = maxSize / 1000 / 1000;
    const maxLength = 1;
    const uploadFileName = "file";
    const uploadVideoParams = config.uploadVideoParams || {};
    const uploadVideoParamsWithUrl = config.uploadVideoParamsWithUrl;
    const uploadedVideoServer = config.uploadedVideoServer || '';
    const uploadVideoHeaders = {};
    const hooks =config.uploadImgHooks || {};
    const timeout = 5 * 60 * 1000;        //5 min
    let withCredentials = config.withCredentials;
    if (withCredentials == null) {
      withCredentials = false;
    }

    const customUploadVideo = config.customUploadImg

    if (!customUploadVideo) {
      if (!uploadVideoServer) {
        return
      }
    }

    // ------------------------------ 验证文件信息 ------------------------------
    const resultFiles = [];
    let errInfo = [];
    arrForEach(files, function (file) {
      let name = file.name;
      let size = file.size;

      // chrome 低版本 name === undefined
      if (!name || !size) {
        return;
      }

      if (/\.(mp4)$/i.test(name) === false) {
        // 后缀名不合法，不是视频
        errInfo.push('\u3010' + name + '\u3011\u4e0d\u662f\u89c6\u9891');
        return;
      }
      if (maxSize < size) {
        // 上传视频过大
        errInfo.push('\u3010' + name + '\u3011\u5927\u4E8E ' + maxSizeM + 'M');
        return;
      }

      // 验证通过的加入结果列表
      resultFiles.push(file);
    });
    // 抛出验证信息
    if (errInfo.length) {
      this._alert('视频验证未通过: \n' + errInfo.join('\n'));
      return;
    }
    if (resultFiles.length > maxLength) {
      this._alert('一次最多上传' + maxLength + '个视频');
      return;
    }

    // ------------------------------ 自定义上传 ------------------------------

    if (customUploadVideo && typeof customUploadVideo === 'function') {
      customUploadVideo(resultFiles, this.insertLinkImg.bind(this))

      // 阻止以下代码执行
      return
    }
    
    // 添加视频数据
    let formdata = new FormData();
    arrForEach(resultFiles, function (file) {
      formdata.append(uploadFileName, file);
      formdata.append('typeName', '');
    });

    // ------------------------------ 上传视频 ------------------------------
    if (uploadVideoServer && typeof uploadVideoServer === 'string') {
      // 添加参数
      const uploadVideoServerArr = uploadVideoServer.split('#');
      uploadVideoServer = uploadVideoServerArr[0];
      const uploadVideoServerHash = uploadVideoServerArr[1] || '';
      objForEach(uploadVideoParams, function (key, val) {
        val = encodeURIComponent(val);

        // 第一，将参数拼接到 url 中
        if (uploadVideoParamsWithUrl) {

          if (uploadVideoServer.indexOf('?') > 0) {
            uploadVideoServer += '&';
          } else {
            uploadVideoServer += '?';
          }
          uploadVideoServer = uploadVideoServer + key + '=' + val;
        }
      });
      if (uploadVideoServerHash) {
        uploadVideoServer += '#' + uploadVideoServerHash;
      }

      // 定义 xhr
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadVideoServer);
      // 发送请求
      xhr.send(formdata);
      // 设置超时
      xhr.timeout = timeout;
      xhr.ontimeout = function () {
        // hook - timeout
        if (hooks.timeout && typeof hooks.timeout === 'function') {
          hooks.timeout(xhr, editor);
        }

        this._alert('上传视频超时');
      };

      // 监控 progress
      if (xhr.upload) {
        xhr.upload.onprogress = function (e) {
          let percent
          // 进度条
          const progressBar = new Progress(editor);
          if (e.lengthComputable) {
            percent = e.loaded / e.total;
            progressBar.show(percent);
          }
        };
      }

      // 返回数据
      xhr.onreadystatechange = function () {
        let result
        if (xhr.readyState === 4) {
          if (xhr.status < 200 || xhr.status >= 300) {
            // hook - error
            if (hooks.error && typeof hooks.error === 'function') {
              hooks.error(xhr, editor);
            }

            // xhr 返回状态错误
            this._alert('上传视频发生错误', '\u4E0A\u4F20\u56FE\u7247\u53D1\u751F\u9519\u8BEF\uFF0C\u670D\u52A1\u5668\u8FD4\u56DE\u72B6\u6001\u662F ' + xhr.status);
            return;
          }
          result = xhr.responseText;
          if (typeof result !== 'object') {
            try {
              result = JSON.parse(result);
            } catch (ex) {
              // hook - fail
              if (hooks.fail && typeof hooks.fail === 'function') {
                hooks.fail(xhr, editor, result);
              }
              this._alert('上传视频失败', '上传视频返回结果错误，返回结果是: ' + result);
              return;
            }
          }
          if (!hooks.customInsert && result.code !== 0) {
            // hook - fail
            if (hooks.fail && typeof hooks.fail === 'function') {
              hooks.fail(xhr, editor, result);
            }

            // 数据错误
            this._alert('上传视频失败', '上传视频返回结果错误，返回结果 errno=' + result.errno);
          } else {
            console.log(hooks.customInsert && typeof hooks.customInsert === 'function');
            if (hooks.customInsert && typeof hooks.customInsert === 'function') {
              hooks.customInsert(this.insertLinkVideo.bind(this), result, editor);
            } else {
              // 将视频插入编辑器
              const data = result || [];
              // data.forEach(function (link) {
              //     console.log(link);
              //
              // });
              this.insertLinkVideo(`${uploadedVideoServer}${data.rows.path}`);
            }
            // hook - success
            if (hooks.success && typeof hooks.success === 'function') {
              hooks.success(xhr, editor, result);
            }
          }
        }
      };

      // hook - before
      if (hooks.before && typeof hooks.before === 'function') {
        const beforeResult = hooks.before(xhr, editor, resultFiles);
        if (beforeResult && typeof beforeResult === 'object') {
          if (beforeResult.prevent) {
            // 如果返回的结果是 {prevent: true, msg: 'xxxx'} 则表示用户放弃上传
            this._alert(beforeResult.msg);
            return;
          }
        }
      }

      // 自定义 headers
      objForEach(uploadVideoHeaders, function (key, val) {
        xhr.setRequestHeader(key, val);
      });

      // // 跨域传 cookie
      xhr.withCredentials = withCredentials;



      // 注意，要 return 。不去操作接下来的 base64 显示方式
      return;
    }
  }
};

export default UploadVideo