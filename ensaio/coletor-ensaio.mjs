#!/usr/bin/env node
// Coletor do ensaio local: o mesmo laço de backend/execucao/node.js (mesma Fonte, mesma rodada, mesma gravação),
// consultando o host de simulação do TSE (https://resultados-sim.tse.jus.br, permitido pelo conector) e
// entregando cada requisição, por HTTP de verdade, ao TSE simulado local (ensaio/tse-simulado.mjs).
// Só o transporte muda; nada sai para a internet.
//
//   node ensaio/coletor-ensaio.mjs --saida <pasta>/dados --estado <arquivo> --local http://127.0.0.1:8790
import { parseArgs } from "node:util";
import { Fonte } from "../backend/conectores/http.js";
import { rodada } from "../backend/coletor/rodada.js";
import { gravarSaidas, carregarEstado, gravarEstado } from "../backend/armazenamento/arquivos.js";

export const BASE_SIMULADA = "https://resultados-sim.tse.jus.br";

const { values: a } = parseArgs({
  options: {
    saida: { type: "string" },
    estado: { type: "string" },
    local: { type: "string", default: "http://127.0.0.1:8790" },
    intervalo: { type: "string", default: "15" },
    modo: { type: "string", default: "simulacao" },
  },
});
const intervaloS = Math.max(10, Number(a.intervalo));
let estado = await carregarEstado(a.estado);
const fonte = new Fonte({
  fetch: (url, init) => globalThis.fetch(url.replace(BASE_SIMULADA, a.local), init),
  estado: estado?.fonte,
});

for (;;) {
  const t0 = Date.now();
  const r = await rodada(fonte, estado, { modo: a.modo, base: BASE_SIMULADA, intervaloS });
  estado = r.estado;
  await gravarSaidas(a.saida, r.saidas, r.brutos);
  await gravarEstado(a.estado, estado);
  const s = r.saidas["v1/saude.json"].coletor;
  const pres = r.saidas["v1/presidente.json"];
  console.log(`${new Date().toISOString()} ${pres.estado_publicacao} ${s.estado} req=${s.rodada.requisicoes} http=${JSON.stringify(s.status_http)} conferência=${pres.conferencia?.classificacao.codigo ?? "-"}${s.pausa ? ` PAUSA até ${s.pausa.ate}` : ""}`);
  await new Promise((res) => setTimeout(res, Math.max(1000, intervaloS * 1000 - (Date.now() - t0))));
}
