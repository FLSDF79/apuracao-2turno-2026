import test from "node:test";
import assert from "node:assert/strict";
import { Fonte, segundosRetryAfter } from "../../backend/conectores/http.js";
import { relogio } from "./apoio.mjs";

const U = "https://resultados.tse.jus.br/oficial/x.json";

function servidor(respostas) {
  const pedidos = [];
  const f = async (url, init) => {
    pedidos.push({ url, headers: init.headers });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(init) : r;
  };
  return { f, pedidos };
}
const json = (o, h = {}) => new Response(JSON.stringify(o), { status: 200, headers: { etag: '"a"', ...h } });

test("requisição condicional: manda If-None-Match e reaproveita o corpo no 304", async () => {
  const rel = relogio();
  const { f, pedidos } = servidor([json({ v: 1 }), new Response(null, { status: 304 })]);
  const fonte = new Fonte({ fetch: f, ...rel });
  const r1 = await fonte.obter(U);
  const r2 = await fonte.obter(U);
  assert.equal(r1.status, 200);
  assert.equal(pedidos[1].headers["If-None-Match"], '"a"');
  assert.deepEqual([r2.ok, r2.status, r2.alterado, r2.dados], [true, 304, false, { v: 1 }]);
});

test("404 em sequência pausa o coletor inteiro e nenhuma requisição sai durante a pausa", async () => {
  const rel = relogio();
  const n404 = () => new Response("x", { status: 404 });
  const { f, pedidos } = servidor([n404(), n404(), n404(), json({})]);
  const fonte = new Fonte({ fetch: f, ...rel });
  for (const u of ["a", "b", "c"]) assert.equal((await fonte.obter(`${U}${u}`)).nao_publicado, true);
  assert.ok(fonte.pausado());
  const r = await fonte.obter(`${U}d`);
  assert.equal(r.adiado, true);
  assert.equal(pedidos.length, 3);
  rel.avancar(2 * 60 * 1000 + 1);
  assert.equal((await fonte.obter(`${U}d`)).ok, true);
});

test("429 com Retry-After pausa pelo tempo pedido; 403 pausa 10 min", async () => {
  const rel = relogio();
  const { f } = servidor([new Response("", { status: 429, headers: { "retry-after": "30" } }), new Response("", { status: 403 })]);
  const fonte = new Fonte({ fetch: f, ...rel });
  await fonte.obter(U);
  assert.equal(Date.parse(fonte.pausado().ate) - rel.agora(), 30000);
  rel.avancar(30001);
  await fonte.obter(`${U}2`);
  assert.equal(Date.parse(fonte.pausado().ate) - rel.agora(), 10 * 60 * 1000);
});

test("erro de rede e timeout: backoff por URL, sem derrubar as outras", async () => {
  const rel = relogio();
  const lento = (init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))));
  const { f } = servidor([new Error("ECONNRESET"), lento, json({ ok: 1 })]);
  const fonte = new Fonte({ fetch: f, ...rel, timeoutMs: 20 });
  const r1 = await fonte.obter(U);
  assert.match(r1.erro, /erro de rede/);
  assert.equal((await fonte.obter(U)).adiado, true); // dentro do backoff
  const r2 = await fonte.obter(`${U}b`);
  assert.match(r2.erro, /timeout/);
  assert.equal((await fonte.obter(`${U}c`)).ok, true);
  assert.equal(fonte.pausado(), null);
});

test("resposta 200 que não é JSON não substitui o último dado válido", async () => {
  const rel = relogio();
  const { f } = servidor([json({ v: 1 }), new Response("<html>manutenção</html>", { status: 200 })]);
  const fonte = new Fonte({ fetch: f, ...rel });
  await fonte.obter(U);
  const r = await fonte.obter(U);
  assert.equal(r.ok, false);
  assert.equal(JSON.parse(fonte.estado.urls[U].corpo).v, 1);
});

test("limite global de requisições por segundo", async () => {
  const rel = relogio();
  const f = async () => json({});
  const fonte = new Fonte({ fetch: f, ...rel, maxPorSegundo: 5 });
  const t0 = rel.agora();
  for (let i = 0; i < 12; i++) await fonte.obter(`${U}${i}`);
  assert.ok(rel.agora() - t0 >= 2000);
});

test("Retry-After em segundos ou data HTTP", () => {
  assert.equal(segundosRetryAfter("12", 0), 12000);
  assert.equal(segundosRetryAfter(new Date(60000).toUTCString(), 0), 60000);
  assert.equal(segundosRetryAfter(null, 0), null);
});
