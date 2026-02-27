'use strict';
'require form';
'require poll';
'require rpc';
'require ui';
'require uci';
'require view';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

var callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: ['name', 'action'],
	expect: { result: false }
});

function getMainSection() {
	var sections = uci.sections('dufs', 'dufs');
	return sections && sections.length ? sections[0] : {};
}

function getMainSectionName() {
	var cfg = getMainSection();
	return cfg && cfg['.name'] ? cfg['.name'] : null;
}

function isFlagEnabled(value) {
	return value === true || value === 1 || value === '1' || value === 'true';
}

function syncInitState(enabled) {
	var actions = enabled ? ['enable', 'restart'] : ['disable', 'stop'];

	return actions.reduce(function(promise, action) {
		return promise.then(function() {
			return L.resolveDefault(callInitAction('dufs', action), null);
		});
	}, Promise.resolve());
}

function exportConfigData() {
	var cfg = getMainSection();
	var data = {};

	Object.keys(cfg || {}).forEach(function(key) {
		if (key.charAt(0) === '.')
			return;
		data[key] = cfg[key];
	});

	return data;
}

function parseBackupText(text) {
	var data = JSON.parse(text);

	if (!data || typeof data !== 'object' || Array.isArray(data))
		throw new Error(_('备份文件内容无效'));

	/* 兼容之前的 {format,version,config} 结构 */
	if (data.config && typeof data.config === 'object' && !Array.isArray(data.config))
		return data.config;

	return data;
}

function buildBackupFilename() {
	var now = new Date();
	var parts = [
		now.getFullYear(),
		('0' + (now.getMonth() + 1)).slice(-2),
		('0' + now.getDate()).slice(-2),
		'-',
		('0' + now.getHours()).slice(-2),
		('0' + now.getMinutes()).slice(-2),
		('0' + now.getSeconds()).slice(-2)
	];

	return 'dufs-config-' + parts.join('') + '.json';
}

function downloadTextFile(filename, content) {
	var blob = new Blob([content], { type: 'application/json;charset=utf-8' });
	var url = window.URL.createObjectURL(blob);
	var link = E('a', {
		href: url,
		download: filename,
		style: 'display:none'
	});

	document.body.appendChild(link);
	link.click();
	window.setTimeout(function() {
		window.URL.revokeObjectURL(url);
		if (link.parentNode)
			link.parentNode.removeChild(link);
	}, 0);
}

function readFileAsText(file) {
	return new Promise(function(resolve, reject) {
		var reader = new FileReader();

		reader.onload = function() {
			resolve(String(reader.result || ''));
		};
		reader.onerror = function() {
			reject(new Error(_('无法读取所选文件')));
		};
		reader.readAsText(file);
	});
}

function stageImportedConfig(importedConfig) {
	var sectionName = getMainSectionName();
	var cfg = getMainSection();

	if (!sectionName)
		return Promise.reject(new Error(_('未找到 dufs 配置节')));

	if (typeof uci.unset === 'function') {
		Object.keys(cfg || {}).forEach(function(key) {
			if (key.charAt(0) === '.')
				return;
			uci.unset('dufs', sectionName, key);
		});
	}

	Object.keys(importedConfig || {}).forEach(function(key) {
		var value = importedConfig[key];
		var listValue;

		if (key.charAt(0) === '.')
			return;
		if (value === null || value === undefined)
			return;
		if (Array.isArray(value)) {
			listValue = value.map(function(item) {
				return String(item === null || item === undefined ? '' : item).trim();
			}).filter(function(item) {
				return item.length > 0;
			});
			if (listValue.length > 0)
				uci.set('dufs', sectionName, key, listValue);
			return;
		}
		if (typeof value === 'object')
			return;
		if (value === true)
			value = '1';
		else if (value === false)
			value = '0';
		else
			value = String(value);
		if (value !== '')
			uci.set('dufs', sectionName, key, value);
	});

	return Promise.resolve(uci.save());
}

function getServiceStatus() {
	return L.resolveDefault(callServiceList('dufs'), {}).then(function(res) {
		var instances = {};
		var name;

		try {
			instances = res.dufs.instances || {};
		} catch (e) {}

		for (name in instances) {
			if (instances[name] && instances[name].running)
				return true;
		}

		return false;
	});
}

function normalizePathPrefix(pathPrefix) {
	var value = String(pathPrefix || '').trim();

	if (!value)
		return '';

	if (value.charAt(0) !== '/')
		value = '/' + value;

	value = value.replace(/\/+$/, '');
	return value;
}

function getHostForURL() {
	var host = window.location.hostname || '127.0.0.1';

	if (host.indexOf(':') !== -1 && host.charAt(0) !== '[')
		host = '[' + host + ']';

	return host;
}

function buildBaseURL(cfg) {
	var scheme = (cfg.tls_cert && cfg.tls_key) ? 'https' : 'http';
	var host = getHostForURL();
	var port = String(cfg.port || '5000');
	var prefix = normalizePathPrefix(cfg.path_prefix);

	return String.format('%s://%s:%s%s/', scheme, host, port, prefix);
}

function buildHealthURL(cfg) {
	var scheme = (cfg.tls_cert && cfg.tls_key) ? 'https' : 'http';
	var host = getHostForURL();
	var port = String(cfg.port || '5000');
	var prefix = normalizePathPrefix(cfg.path_prefix);

	return String.format('%s://%s:%s%s/__dufs__/health', scheme, host, port, prefix);
}

function requestWithTimeout(url, options, timeoutMs) {
	var timer = null;

	return Promise.race([
		fetch(url, options),
		new Promise(function(resolve, reject) {
			timer = window.setTimeout(function() {
				reject(new Error('timeout'));
			}, timeoutMs);
		})
	]).then(function(res) {
		if (timer !== null)
			window.clearTimeout(timer);

		return res;
	}, function(err) {
		if (timer !== null)
			window.clearTimeout(timer);

		throw err;
	});
}

function requestHealthJSON(url) {
	if (typeof fetch !== 'function')
		return Promise.resolve({ healthy: null, reason: 'fetch_unavailable' });

	return requestWithTimeout(url, {
		method: 'GET',
		cache: 'no-store',
		credentials: 'omit',
		mode: 'cors'
	}, 3000).then(function(res) {
		if (!res.ok)
			return { healthy: false, reason: 'http_' + res.status };

		return res.json().then(function(data) {
			if (data && data.status === 'OK')
				return { healthy: true, reason: 'ok' };

			return { healthy: false, reason: 'invalid_payload' };
		}, function() {
			return { healthy: false, reason: 'invalid_json' };
		});
	}, function(err) {
		if (err && err.message === 'timeout')
			return { healthy: false, reason: 'timeout' };

		return { healthy: false, reason: 'request_error' };
	});
}

function probeHealthOpaque(url) {
	if (typeof fetch !== 'function')
		return Promise.resolve(false);

	return requestWithTimeout(url, {
		method: 'GET',
		cache: 'no-store',
		credentials: 'omit',
		mode: 'no-cors'
	}, 3000).then(function() {
		return true;
	}, function() {
		return false;
	});
}

function getHealthStatus(cfg) {
	var healthURL = buildHealthURL(cfg);
	var corsEnabled = isFlagEnabled(cfg.enable_cors);

	return requestHealthJSON(healthURL).then(function(status) {
		var reason = status.reason || '';

		if (status.healthy === true ||
			corsEnabled ||
			reason.indexOf('http_') === 0 ||
			reason === 'invalid_json' ||
			reason === 'invalid_payload' ||
			reason === 'fetch_unavailable')
			return { url: healthURL, healthy: status.healthy, reason: reason };

		return probeHealthOpaque(healthURL).then(function(reachable) {
			if (reachable)
				return { url: healthURL, healthy: null, reason: 'opaque' };

			return { url: healthURL, healthy: false, reason: reason };
		});
	});
}

function reasonToText(reason) {
	if (!reason || reason === 'ok')
		return _('正常');
	if (reason === 'service_stopped')
		return _('服务未运行');
	if (reason === 'timeout')
		return _('请求超时');
	if (reason === 'request_error')
		return _('请求失败（可能为网络不可达或浏览器跨域限制）');
	if (reason === 'invalid_json')
		return _('响应不是有效 JSON');
	if (reason === 'invalid_payload')
		return _('响应内容不是 status=OK');
	if (reason === 'opaque')
		return _('服务可达，但浏览器无法读取跨域响应内容');
	if (reason === 'fetch_unavailable')
		return _('当前浏览器不支持 fetch');
	if (reason.indexOf('http_') === 0)
		return _('HTTP 状态码 ') + reason.substring(5);

	return reason;
}

function renderStatus(state, cfg) {
	var title;
	var detail;
	var color;
	var html;

	if (!state.running) {
		title = _('未运行');
		detail = _('dufs 进程未启动。');
		color = 'red';
	} else if (state.healthy === true) {
		title = _('运行中（健康）');
		detail = _('健康检查通过。');
		color = 'green';
	} else if (state.healthy === null) {
		title = _('运行中（健康未知）');
		detail = reasonToText(state.reason);
		color = '#d48806';
	} else {
		title = _('运行中（健康异常）');
		detail = reasonToText(state.reason);
		color = '#d48806';
	}

	html = String.format('<em><span style="color:%s"><strong>%s</strong></span></em>', color, title);
	html += String.format('<span style="margin-left:8px;">%s</span>', detail);

	if (state.running) {
		html += String.format(
			'&#160;<a class="btn cbi-button" href="%s" target="_blank" rel="noreferrer noopener">%s</a>',
			state.webURL,
			_('打开 Web 界面')
		);
	}

	html += String.format(
		'<div class="cbi-value-description">%s <code>%s</code></div>',
		_('健康检查地址：'),
		state.healthURL
	);

	if (state.running && !isFlagEnabled(cfg.enable_cors)) {
		html += String.format(
			'<div class="cbi-value-description">%s</div>',
			_('提示：未启用 CORS 时，跨端口场景可能只能判断“可达”，无法读取健康响应内容。')
		);
	}

	return html;
}

return view.extend({
	load: function() {
		return uci.load('dufs');
	},

	handleSaveApply: function(ev, mode) {
		return Promise.resolve(this.handleSave(ev)).then(function() {
			var cfg = getMainSection();
			return syncInitState(isFlagEnabled(cfg.enabled));
		}).then(function() {
			ui.changes.apply(mode == '0');
		});
	},

	render: function() {
		var m, s, o;

		m = new form.Map(
			'dufs',
			_('Dufs 文件服务'),
			_('轻量级文件服务器。建议先配置访问控制与监听地址，再启用服务。')
		);

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.addremove = false;
		s.render = function() {
			var updateStatus = function() {
				var cfg = getMainSection();

				return L.resolveDefault(getServiceStatus(), false).then(function(isRunning) {
					if (!isRunning) {
						return {
							running: false,
							healthy: false,
							reason: 'service_stopped',
							webURL: buildBaseURL(cfg),
							healthURL: buildHealthURL(cfg)
						};
					}

					return L.resolveDefault(getHealthStatus(cfg), {
						url: buildHealthURL(cfg),
						healthy: false,
						reason: 'request_error'
					}).then(function(health) {
						return {
							running: true,
							healthy: health.healthy,
							reason: health.reason,
							webURL: buildBaseURL(cfg),
							healthURL: health.url
						};
					});
				}).then(function(state) {
					var view = document.getElementById('dufs_service_status');
					if (view)
						view.innerHTML = renderStatus(state, cfg);
				});
			};

			updateStatus();
			poll.add(updateStatus, 5);

			return E('div', { class: 'cbi-section' }, [
				E('p', { id: 'dufs_service_status' }, _('正在获取服务状态...'))
			]);
		};

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.addremove = false;
		s.render = function() {
			var exportBtn;
			var importBtn;
			var fileInput;
			var resultLine = E('p', { class: 'cbi-value-description' }, '');
			var setResult = function(text, isError) {
				resultLine.textContent = text || '';
				resultLine.style.color = isError ? '#cf1322' : '#237804';
			};
			var setBusy = function(isBusy) {
				exportBtn.disabled = isBusy;
				importBtn.disabled = isBusy;
			};

			fileInput = E('input', {
				type: 'file',
				accept: '.json,application/json',
				style: 'display:none'
			});

			exportBtn = E('button', {
				class: 'btn cbi-button cbi-button-action',
				style: 'margin-right:8px;',
				click: function(ev) {
					var payload;

					ev.preventDefault();

					try {
						payload = JSON.stringify(exportConfigData(), null, 2) + '\n';
						downloadTextFile(buildBackupFilename(), payload);
						setResult(_('已导出 dufs 配置文件。'), false);
					} catch (err) {
						setResult(_('导出失败：') + (err && err.message ? err.message : _('未知错误')), true);
					}
				}
			}, [ _('导出配置') ]);

			importBtn = E('button', {
				class: 'btn cbi-button cbi-button-action',
				click: function(ev) {
					ev.preventDefault();
					fileInput.click();
				}
			}, [ _('导入配置') ]);

			fileInput.addEventListener('change', function() {
				var file = fileInput.files && fileInput.files[0];

				if (!file)
					return;

				setBusy(true);
				setResult(_('正在导入配置...'), false);

				readFileAsText(file).then(function(content) {
					return stageImportedConfig(parseBackupText(content));
				}).then(function() {
					setResult(_('导入成功，请点击“保存并应用”。'), false);
					window.setTimeout(function() {
						window.location.reload();
					}, 300);
				}, function(err) {
					setResult(_('导入失败：') + (err && err.message ? err.message : _('未知错误')), true);
				}).then(function() {
					setBusy(false);
					fileInput.value = '';
				});
			});

			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('配置备份与恢复')),
				E('p', { class: 'cbi-value-description' }, _('导出当前 dufs 配置到 JSON 文件，或导入并覆盖当前页面配置。')),
				E('div', { class: 'cbi-value-field', style: 'margin-top:8px;margin-bottom:8px;' }, [
					exportBtn,
					importBtn,
					fileInput
				]),
				resultLine
			]);
		};

		s = m.section(form.TypedSection, 'dufs', _('基础设置'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(
			form.Flag,
			'enabled',
			_('启用服务'),
			_('是否启动 dufs 服务。默认关闭，避免安装后直接暴露文件目录。')
		);
		o.rmempty = false;

		o = s.option(
			form.Value,
			'serve_path',
			_('共享目录'),
			_('dufs 对外提供访问的根目录，建议填写绝对路径，例如 /mnt。')
		);
		o.placeholder = '/mnt';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value || value.charAt(0) !== '/')
				return _('共享目录必须是绝对路径（以 / 开头）');
			return true;
		};

		o = s.option(
			form.DynamicList,
			'bind',
			_('监听地址'),
			_('可添加多个监听地址，例如 127.0.0.1、192.168.1.1 或 ::1。')
		);
		o.placeholder = '127.0.0.1';

		o = s.option(
			form.Value,
			'port',
			_('监听端口'),
			_('HTTP 服务端口，默认 5000。')
		);
		o.datatype = 'port';
		o.placeholder = '5000';
		o.rmempty = false;

		o = s.option(
			form.Value,
			'path_prefix',
			_('URL 前缀'),
			_('用于把 dufs 挂载到子路径（如 /files）。留空表示根路径。')
		);
		o.placeholder = '/dufs';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (value.charAt(0) !== '/')
				return _('URL 前缀必须以 / 开头');
			return true;
		};

		o = s.option(
			form.DynamicList,
			'hidden',
			_('隐藏文件/路径规则'),
			_('设置后将隐藏匹配项，支持通配符，例如 *.log、private/*。')
		);
		o.placeholder = '*.log';

		o = s.option(
			form.DynamicList,
			'auth',
			_('认证规则'),
			_('格式：用户名:密码@路径:权限，例如 admin:admin@/:rw。权限常用 ro(只读) 或 rw(读写)。 匿名访问用 @/路径，例如 @/public:ro。')
		);
		o.placeholder = 'admin:admin@/:rw';

		o = s.option(
			form.Flag,
			'allow_all',
			_('允许全部操作'),
			_('开启后等同同时允许上传、删除、搜索、符号链接、打包下载与哈希查询。')
		);
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_upload', _('允许上传'), _('允许通过网页上传文件。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(form.Flag, 'allow_delete', _('允许删除'), _('允许通过网页删除文件或目录。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(form.Flag, 'allow_search', _('允许搜索'), _('允许在网页中搜索文件名。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(form.Flag, 'allow_symlink', _('允许符号链接'), _('允许访问/创建符号链接（按 dufs 行为处理）。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(form.Flag, 'allow_archive', _('允许打包下载'), _('允许将目录打包为压缩包后下载。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(form.Flag, 'allow_hash', _('允许哈希查询'), _('允许查询文件哈希值（如 SHA256）。'));
		o.default = o.disabled;
		o.depends('allow_all', '0');

		o = s.option(
			form.Flag,
			'enable_cors',
			_('启用 CORS'),
			_('允许跨域访问。仅在确有跨域需求时开启，避免扩大攻击面。')
		);
		o.default = o.disabled;

		o = s.option(
			form.Flag,
			'render_index',
			_('优先渲染 index.html'),
			_('目录下存在 index.html 时优先返回该文件。')
		);
		o.default = o.disabled;

		o = s.option(
			form.Flag,
			'render_try_index',
			_('尝试回退到 index.html'),
			_('请求路径不存在时，尝试返回同级 index.html。常用于前端路由回退。')
		);
		o.default = o.disabled;

		o = s.option(
			form.Flag,
			'render_spa',
			_('单页应用模式 (SPA)'),
			_('未知路径统一回退到入口页，适合前端单页应用。')
		);
		o.default = o.disabled;

		o = s.option(
			form.Value,
			'assets',
			_('静态资源目录'),
			_('自定义前端资源目录，通常填写绝对路径，例如 /www/dufs-assets。')
		);
		o.placeholder = '/www/dufs-assets';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (value.charAt(0) !== '/')
				return _('静态资源目录必须是绝对路径（以 / 开头）');
			return true;
		};

		o = s.option(
			form.Value,
			'log_format',
			_('日志格式'),
			_('自定义访问日志格式，例如 $remote_addr "$request" $status。')
		);
		o.placeholder = '$remote_addr "$request" $status';

		o = s.option(
			form.Value,
			'log_file',
			_('日志文件'),
			_('日志输出到指定文件。留空时输出到系统日志（stdout/stderr）。')
		);
		o.placeholder = '/var/log/dufs.log';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (value.charAt(0) !== '/')
				return _('日志文件路径必须是绝对路径（以 / 开头）');
			return true;
		};

		o = s.option(
			form.ListValue,
			'compress',
			_('压缩级别'),
			_('控制传输压缩强度。压缩越高越省带宽，但会增加路由器 CPU 开销。')
		);
		o.value('none', _('关闭'));
		o.value('low', _('低'));
		o.value('medium', _('中'));
		o.value('high', _('高'));
		o.default = 'low';

		o = s.option(
			form.Value,
			'tls_cert',
			_('TLS 证书路径'),
			_('启用 HTTPS 所需证书文件（PEM）。需与私钥同时配置。')
		);
		o.placeholder = '/etc/dufs/cert.pem';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (value.charAt(0) !== '/')
				return _('TLS 证书路径必须是绝对路径（以 / 开头）');
			return true;
		};

		o = s.option(
			form.Value,
			'tls_key',
			_('TLS 私钥路径'),
			_('启用 HTTPS 所需私钥文件（PEM）。需与证书同时配置。')
		);
		o.placeholder = '/etc/dufs/key.pem';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (value.charAt(0) !== '/')
				return _('TLS 私钥路径必须是绝对路径（以 / 开头）');
			return true;
		};

		o = s.option(
			form.Value,
			'user',
			_('运行用户'),
			_('进程运行用户。建议使用低权限用户，避免长期使用 root。')
		);
		o.placeholder = 'root';
		o.rmempty = false;

		o = s.option(
			form.Value,
			'group',
			_('运行用户组'),
			_('进程运行用户组。应与运行用户权限策略保持一致。')
		);
		o.placeholder = 'root';
		o.rmempty = false;

		o = s.option(
			form.DynamicList,
			'extra_args',
			_('额外参数'),
			_('按原样追加到 dufs 启动命令。仅在确认参数含义后使用，避免与上面配置冲突。')
		);
		o.placeholder = '--allow-upload';

		return m.render();
	}
});
