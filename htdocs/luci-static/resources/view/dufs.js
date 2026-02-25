'use strict';
'require form';
'require view';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('dufs', _('Dufs'), _('Lightweight file server with web UI.'));

		s = m.section(form.TypedSection, 'dufs', _('Main settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		o = s.option(form.Value, 'serve_path', _('Serve path'));
		o.placeholder = '/mnt';
		o.rmempty = false;

		o = s.option(form.DynamicList, 'bind', _('Bind addresses'));
		o.placeholder = '0.0.0.0';

		o = s.option(form.Value, 'port', _('Port'));
		o.datatype = 'port';
		o.placeholder = '5000';
		o.rmempty = false;

		o = s.option(form.Value, 'path_prefix', _('Path prefix'));
		o.placeholder = '/dufs';

		o = s.option(form.DynamicList, 'hidden', _('Hidden paths/patterns'));
		o.placeholder = '*.log';

		o = s.option(form.DynamicList, 'auth', _('Auth rules'));
		o.placeholder = 'admin:admin@/:rw';

		o = s.option(form.Flag, 'allow_all', _('Allow all operations'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_upload', _('Allow upload'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_delete', _('Allow delete'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_search', _('Allow search'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_symlink', _('Allow symlink'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_archive', _('Allow archive download'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'allow_hash', _('Allow hash query'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'enable_cors', _('Enable CORS'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'render_index', _('Render index.html'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'render_try_index', _('Try render index.html'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'render_spa', _('Render SPA'));
		o.default = o.disabled;

		o = s.option(form.Value, 'assets', _('Assets path'));
		o.placeholder = '/www/dufs-assets';

		o = s.option(form.Value, 'log_format', _('Log format'));
		o.placeholder = '$remote_addr "$request" $status';

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.placeholder = '/var/log/dufs.log';

		o = s.option(form.ListValue, 'compress', _('Compress level'));
		o.value('none', _('None'));
		o.value('low', _('Low'));
		o.value('medium', _('Medium'));
		o.value('high', _('High'));
		o.default = 'low';

		o = s.option(form.Value, 'tls_cert', _('TLS cert path'));
		o.placeholder = '/etc/dufs/cert.pem';

		o = s.option(form.Value, 'tls_key', _('TLS key path'));
		o.placeholder = '/etc/dufs/key.pem';

		o = s.option(form.Value, 'user', _('Run as user'));
		o.placeholder = 'root';
		o.rmempty = false;

		o = s.option(form.Value, 'group', _('Run as group'));
		o.placeholder = 'root';
		o.rmempty = false;

		o = s.option(form.DynamicList, 'extra_args', _('Extra arguments'));
		o.placeholder = '--allow-upload';

		return m.render();
	}
});
