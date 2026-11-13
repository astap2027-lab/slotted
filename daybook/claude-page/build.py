import re, base64, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); host = pathlib.Path(sys.argv[3]).read_text()
core = (src/'core.js').read_text()
names = re.findall(r'^export (?:async )?(?:function|const|let) (\w+)', core, re.M)
core_body = re.sub(r'^export ', '', core, flags=re.M)
app = (src/'app.js').read_text().replace("import * as C from './core.js';\n", '')
css = (src/'styles.css').read_text()
icon = base64.b64encode((src/'icons/icon-192.png').read_bytes()).decode()
app = app.replace('src="icons/icon-192.png"', f'src="data:image/png;base64,{icon}"').replace("icon: 'icons/icon-192.png',", '')
html_body = re.search(r'<body>(.*?)<noscript>', (src/'index.html').read_text(), re.S).group(1)
page = f'''<title>Daybook</title>
<style>
{css}
html, body {{ height: 100%; }}
.app, .compact {{ height: 100% !important; }}
</style>
{html_body}
<script>
{host}
</script>
<script>
(() => {{
const C = (() => {{
{core_body}
return {{ {", ".join(names)} }};
}})();
{app}
}})();
</script>
'''
out.write_text(page)
print(len(page), 'bytes;', len(names), 'core exports')
