# Estratégia FENG: página e edição das regras

A página está em `docs/index.html`. Ela reúne as revisões de conteúdo e as regras de renovação antecipada. No Flamengo, desligamento está descrito assim:

> Não existe desligamento. O Sócio fica Inativo Inadimplente com 3 parcelas em aberto até quitar

A finalização por não renovação do Flamengo continua com 91 dias. É um campo separado.

| Clube | Renovação antecipada |
| --- | --- |
| Flamengo | 45 dias antes do vencimento |
| São Paulo | 60 dias antes do vencimento |
| Fluminense | 30 dias antes do vencimento |
| Vasco | 75 dias antes do vencimento |
| Botafogo | Não informado |

## O que já está preparado

- Consulta das regras por clube, com campos para prazos, condições em texto, fonte, início de vigência e observações.
- Edição na própria página com senha verificada no servidor.
- Gravação em banco de dados, disponível para outros visitantes ao abrir ou atualizar a consulta.
- Histórico das versões e proteção contra duas abas sobrescreverem a mesma revisão.
- Mensagens de erro que não apresentam uma gravação não confirmada como concluída.
- Revisão do quadro das áreas: Estratégia, Pesquisa/Benchmarking/Produto e Performance têm papéis próprios; a operação dos canais está atribuída aos responsáveis da conta.

**A edição online ainda precisa ser ativada.** Nenhum serviço foi publicado e nenhuma senha foi definida nesta entrega. Sem a configuração abaixo, o manual abre com os valores desta versão e o botão de edição fica indisponível.

## Como a hospedagem funciona

O GitHub Pages hospeda a página. Um Cloudflare Worker recebe os pedidos de leitura, verifica a senha e grava no banco D1. O HTML não contém senha, hash de senha, token do GitHub ou chave do banco. O único endereço configurado na página é a URL pública do serviço.

Depois dessa configuração inicial, você edita as regras na página e salva. Não precisa alterar nem publicar novamente o arquivo no GitHub a cada ajuste. As regras salvas são carregadas do banco. O arquivo do repositório continua contendo a versão inicial como referência para quando a consulta online não estiver disponível.

A senha protege a edição. A leitura continua disponível aos visitantes que conseguem acessar a página. Fonte e observações devem conter informações de negócio, sem dados pessoais de sócios ou credenciais.

## Ativação inicial

A pessoa que configurar a hospedagem precisa de acesso ao repositório GitHub e a uma conta Cloudflare. Use Node.js 24 ou mais recente e Python 3. Não envie a senha em mensagens e não a coloque no repositório.

### 1. Cadastrar o banco

Abra o terminal na pasta `worker` deste pacote:

```bash
npx wrangler@4 login
npx wrangler@4 d1 create feng-regras
```

Copie o `database_id` devolvido pelo segundo comando para `worker/wrangler.jsonc`, no lugar de `PREENCHER-ID-DO-D1`.

No mesmo arquivo, preencha `ALLOWED_ORIGIN` com a origem real da página. Exemplo: para `https://minhaempresa.github.io/estrategia/`, use `https://minhaempresa.github.io`, sem o caminho `/estrategia/` e sem barra final. Se usar domínio próprio, informe a origem HTTPS desse domínio.

### 2. Criar as tabelas e carregar a primeira versão

Ainda dentro da pasta `worker`:

```bash
npx wrangler@4 d1 migrations apply feng-regras --remote
npx wrangler@4 d1 execute feng-regras --remote --file=seed.sql
npx wrangler@4 deploy
```

Guarde a URL HTTPS do Worker mostrada ao final. A carga inicial não substitui regras já existentes. As tabelas são criadas por migração, não a cada acesso à página.

### 3. Definir sua senha

Na raiz do pacote:

```bash
python3 scripts/set_password.py
```

Digite uma senha ou frase forte, com 16 a 256 caracteres, e confirme. O terminal não mostra os caracteres digitados. O script envia somente o hash com sal ao armazenamento de segredos do Worker; não cria um arquivo com a senha.

Para trocar a senha futuramente, execute o mesmo comando. A troca invalida o acesso das sessões anteriores. É necessário continuar com acesso à conta Cloudflare para configurar ou redefinir essa senha.

### 4. Conectar a página ao serviço

Na raiz do pacote, substitua a URL de exemplo pela URL real recebida no deploy:

```bash
python3 scripts/configure_page.py https://feng-regras.SEUSUBDOMINIO.workers.dev
```

Esse comando altera apenas o endereço público do serviço no arquivo `docs/index.html`.

### 5. Publicar no GitHub Pages

Envie o conteúdo deste pacote ao repositório. Na configuração do repositório, abra **Settings → Pages**, escolha **Deploy from a branch**, a branch desejada e a pasta **/docs**.

O arquivo que abre a página é `docs/index.html`. A pasta contém também `.nojekyll`. Publique a versão do HTML configurada no passo anterior, não uma cópia antiga do manual.

### 6. Conferir a ativação

1. Abra a página hospedada e entre em **Regras por clube**. O aviso de configuração pendente deve desaparecer e a versão cadastrada deve aparecer.
2. Clique em **Editar regras**, digite sua senha e confira os campos.
3. Faça uma alteração real que esteja autorizada, descreva o que mudou e salve.
4. Em outra janela, abra ou atualize a consulta e confirme o valor salvo.
5. Abra **Histórico** para verificar a versão anterior e a nova. Clique em **Sair da edição** quando terminar.

Esses passos conferem a integração com suas contas e a hospedagem real. Os testes incluídos no pacote validam o código e o banco local; não substituem essa conferência depois de publicar.

## Uso no dia a dia

- **Renovação antecipada:** dias antes do vencimento. Campo vazio significa que a regra não foi informada; zero é um valor diferente.
- **Recorrência:** carência de pagamento da parcela e regra de desligamento.
- **Renovação:** carência após o vencimento e prazo de finalização.
- **Desligamento:** aceita texto, inclusive condições sem prazo, como a regra do Flamengo.
- **Início de vigência:** preencha somente se conhecido. A data em que você salva não comprova a vigência contratual.
- **Fonte e observações:** registre a confirmação, os planos e os contratos abrangidos.

A página não calcula automaticamente datas de mudança de status, pois os marcos iniciais, limites e horários de processamento ainda dependem da regra de cada conta. Não some os prazos de carência e encerramento sem essa definição.

Os visitantes veem uma atualização ao abrir a página, clicar em **Atualizar consulta** ou voltar para a janela. Uma aba deixada aberta continuamente não recebe transmissão em tempo real.

Se duas abas editarem a mesma versão, a primeira gravação válida é mantida. A segunda recebe um aviso e precisa conferir a versão atual antes de salvar. Se a conexão cair durante a gravação, consulte a versão salva para saber se o servidor recebeu a alteração.

## Detalhes para manutenção

A senha usa PBKDF2-SHA256 com sal aleatório e 100.000 iterações. O hash é um segredo do Worker. Cada acesso gera um token aleatório, válido por uma hora, armazenado somente na memória da aba; o banco guarda o hash do token. A página não usa armazenamento local como fonte das regras ou das credenciais.

O servidor limita a dez tentativas de acesso por endereço IP a cada janela de 15 minutos. Escritas e histórico exigem sessão válida; escritas também exigem a origem HTTPS configurada. A validação de campos e versão ocorre no servidor. O histórico é registrado pela mesma transação que altera as regras.

Rotas:

| Método | Caminho | Acesso |
| --- | --- | --- |
| GET | `/api/rules` | Consulta pública |
| POST | `/api/login` | Verificação de senha |
| PUT | `/api/rules` | Sessão válida e versão atual |
| GET | `/api/history` | Sessão válida; últimas 30 versões |
| POST | `/api/logout` | Revoga a sessão atual |

O histórico completo permanece em `rules_history`, mesmo quando a interface mostra apenas as últimas 30 versões. Para uma exportação de backup, use as ferramentas D1 da conta. Alterações futuras de estrutura devem entrar em novas migrações; preserve `0001_rules.sql` após a primeira aplicação.

## Verificações realizadas

Execute novamente na pasta `worker`, se precisar:

```bash
npm test
```

Os 12 testes verificam regras iniciais; senha incorreta e excesso de tentativas; bloqueio de edição sem autorização; leitura pública; persistência após reabrir o banco; conflito entre versões; histórico; saída e expiração de sessão; invalidação ao trocar senha; origem da requisição; validação de campos e tratamento de falhas.

Também foram conferidos a sintaxe do JavaScript da página, os links internos, os IDs, o índice da busca, os campos das regras e a remoção das descrições antigas do quadro das áreas. Não houve publicação nem teste em navegador nesta entrega.

## Referências técnicas

- [O que é GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Criar uma página no GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Segredos em Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Comandos D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [API do banco D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)
