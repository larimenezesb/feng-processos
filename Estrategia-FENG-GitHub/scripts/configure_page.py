"""Set only the public API URL in the GitHub Pages file."""
import argparse
import re
from pathlib import Path
from urllib.parse import urlsplit
from html import escape

parser = argparse.ArgumentParser(description='Configurar endereço público do serviço de regras.')
parser.add_argument('api_url', help='URL HTTPS devolvida pelo deploy do Worker')
args = parser.parse_args()
u = urlsplit(args.api_url)
if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment:
    raise SystemExit('Informe uma URL HTTPS sem senha, parâmetros ou fragmentos.')
path = Path(__file__).resolve().parents[1] / 'docs/index.html'
s = path.read_text(encoding='utf-8')
s, count = re.subn(r'<meta name="feng-rules-api" content="[^"]*">',
                   '<meta name="feng-rules-api" content="'+escape(args.api_url.rstrip('/'),quote=True)+'">',s)
if count != 1:
    raise SystemExit('Campo de configuração não encontrado ou repetido. Nenhum arquivo alterado.')
path.write_text(s,encoding='utf-8')
print('Endereço configurado em docs/index.html. Publique esse arquivo no GitHub Pages.')
