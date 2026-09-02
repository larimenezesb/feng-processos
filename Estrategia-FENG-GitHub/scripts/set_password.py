"""Define the administrator password without writing it to the repository."""
import getpass
import hashlib
import secrets
import subprocess
from pathlib import Path

password = getpass.getpass('Nova senha (16 a 256 caracteres): ')
if not 16 <= len(password) <= 256:
    raise SystemExit('Use uma senha ou frase com 16 a 256 caracteres.')
if password != getpass.getpass('Repita a senha: '):
    raise SystemExit('As senhas não conferem.')
salt = secrets.token_bytes(16)
password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
encoded = f'v1$100000${salt.hex()}${password_hash.hex()}'
password = ''
subprocess.run(['npx', '--yes', 'wrangler@4', 'secret', 'put', 'ADMIN_PASSWORD_HASH'],
               input=encoded, text=True, check=True,
               cwd=Path(__file__).resolve().parents[1] / 'worker')
print('Senha configurada. As sessões anteriores perderam o acesso.')
