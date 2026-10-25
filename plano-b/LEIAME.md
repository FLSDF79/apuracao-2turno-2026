# Plano B: versão antiga (v0) do painel

Cópia da versão estática do commit `4fe9299` (a `main` antes do PR #4), sem a projeção.
Cada navegador consulta o TSE direto (`resultados.tse.jus.br` libera CORS) e descobre a 6258 pelo `ele-c.json`.
Sem coletor central, sem conferência e sem governador. Só para o caso de o TSE recusar a Cloudflare.

Publicada junto com o painel em `/plano-b/` (cabeçalhos próprios em `_headers`, que liberam `connect-src` para o TSE).
Testada em 25/10 no navegador com o TSE simulado do 2º turno (`/tmp` do validador): descobre a 6258, mostra os
percentuais do arquivo (`pvap`) e "Eleito" só com o arquivo final.
