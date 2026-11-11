# Jogadia + Box 10 (v1)

Site estático (HTML/CSS/JS puro). Funciona no GitHub Pages: suba a pasta inteira.

## Estrutura
- `index.html` portal · `box-10/` o jogo (engine.js, ui.js, i18n.js) · `privacidade/` · `contato/`
- `assets/js/config.js` ← **único lugar com IDs e nome**
- `tests/simulate.js` teste de equilíbrio (`node tests/simulate.js`)

## O que você precisa preencher
1. Nome e domínio finais: troque "Jogadia" e "jogadia.com.br" em todos os arquivos (find/replace) e em `config.js`.
2. `GTM_ID`, `ADSENSE_CLIENT` e `AD_SLOTS` em `assets/js/config.js` (vazio = não carrega).
3. `CONTACT_EMAIL` em `config.js`.
4. Data de lançamento em `box-10/engine.js` (`LAUNCH_DATE`) define o "Dia #1".

## Fora da v1
Combustível, mais pistas, ranking global, outros idiomas (textos já em `i18n.js`), plataforma de consentimento (CMP/TCF) exigida pelo AdSense para tráfego da UE/Reino Unido, validação anti-trapaça (o progresso é local).
