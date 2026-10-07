import sys, re, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
def build(src, out, title, desc, js):
    body = open(src).read()
    # inline page scripts must run after the shared runtime is loaded
    inline = re.findall(r'<script>.*?</script>', body, flags=re.S)
    for blk in inline: body = body.replace(blk, '')
    scripts = ''.join('<script src="%s"></script>\n' % j for j in js)
    html = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700;800&display=swap">
<link rel="stylesheet" href="../shared/vendor/katex/katex.min.css">
<link rel="stylesheet" href="../shared/css/style.css">
<link rel="stylesheet" href="assets/css/link.css">
<script defer src="../shared/vendor/katex/katex.min.js"></script>
<script defer src="../shared/vendor/katex/auto-render.min.js"></script>
</head>
<body>
<div class="layout">
<aside class="sidebar"></aside>
<main class="main">
{body}
<footer class="site-footer"></footer>
</main>
</div>
<script src="assets/js/book.js"></script>
<script src="../shared/js/common.js"></script>
<script src="assets/js/link.js"></script>
<script src="assets/js/codes.js"></script>
{scripts}{''.join(inline)}
</body>
</html>
'''
    open(OUT + out, 'w').write(html)
    print('wrote', out)
if __name__ == '__main__':
    src, out, title, desc = sys.argv[1:5]
    build(src, out, title, desc, sys.argv[5:])
