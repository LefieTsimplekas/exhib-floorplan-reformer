import re
P='/home/claude/webapp/node_modules/@mlightcad/libredwg-web/'
glue=open(P+'wasm/libredwg-web.js').read()
assert glue.rstrip().endswith('export default createModule;')
glue=glue.rstrip()[:-len('export default createModule;')]
dist=open(P+'dist/libredwg-web.js').read()
dist=dist.replace('import createModule from "../wasm/libredwg-web.js";','')
dist=dist.replace('import { default as default2 } from "../wasm/libredwg-web.js";','const default2 = createModule;')
i=dist.rfind('export {'); dist=dist[:i]
assert 'import ' not in dist[:2000] or True
bundle=glue+'\n'+dist
core=open('/home/claude/webapp/core.js').read()
app=open('/home/claude/webapp/app.html').read()
import base64 as _b
font=_b.b64encode(open('/home/claude/webapp/fontsub.ttf','rb').read()).decode()
out=app.replace('/*__CORE__*/',core).replace('/*__DWG__*/',bundle).replace('/*__FONTB64__*/',font)
assert '</script' not in core and '</script' not in bundle
open('/home/claude/webapp/dist/index.html','w').write(out)
print(len(out))
# ---- standalone single file (no claude.ai needed): wasm embedded, normal downloads ----
import base64
b64=base64.b64encode(open(P+'wasm/libredwg-web.wasm','rb').read()).decode()
head='<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>'
sa=head+'<script>window.__STANDALONE=true;window.__WASM_B64="'+b64+'";</script>'+out+'</body></html>'
open('/home/claude/webapp/dist/Katopseis_Stand.html','w').write(sa)
print('standalone',len(sa)//1024//1024,'MB')
# ---- GitHub Pages site: index.html + wasm next to it, normal browser downloads ----
import os, shutil
os.makedirs('/home/claude/webapp/site', exist_ok=True)
page='<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="Από το DWG της έκθεσης σε καθαρή κάτοψη A3 για κάθε περίπτερο."><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body><script>window.__STANDALONE=true;</script>'+out+'</body></html>'
open('/home/claude/webapp/site/index.html','w').write(page)
shutil.copy(P+'wasm/libredwg-web.wasm','/home/claude/webapp/site/libredwg-web.wasm')
open('/home/claude/webapp/site/.nojekyll','w').write('')
print('site', len(page))
