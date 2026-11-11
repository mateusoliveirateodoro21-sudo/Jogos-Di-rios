/* Teste de equilíbrio do Box 10.
 * Uso:  node tests/simulate.js            (relatório completo)
 *       node tests/simulate.js --quick    (menos corridas, mais rápido)
 */
'use strict';
var E = require('../box-10/engine.js');
var quick = process.argv.indexOf('--quick') !== -1;

function dayList(n, start) {
  var out = [], t = Date.parse((start || '2026-12-01') + 'T12:00:00Z');
  for (var i = 0; i < n; i++) out.push(new Date(t + i * 86400000).toISOString().slice(0, 10));
  return out;
}
function allSpecs(days) {
  var out = [];
  days.forEach(function (d) { for (var i = 1; i <= E.CFG.RACES_PER_DAY; i++) out.push(E.getRaceSpec(d, i)); });
  return out;
}
function withWeather(spec, w) {
  var arr = []; for (var i = 0; i < spec.laps; i++) arr.push(w);
  return Object.assign({}, spec, { weatherByLap: arr });
}
function run(spec, carId, parts, setup) {
  return E.simulateRace(spec, { carId: carId, parts: parts, setup: setup });
}
var COMPS = ['soft', 'medium', 'hard'];

/* Todas as opções de ajuste (câmbio de 0 a 1 em passos de 0,1; 3 pneus; sem box ou 1 parada) */
function candidates(laps) {
  var out = [], g, c, p, c2;
  for (g = 0; g <= 10; g++) for (c = 0; c < 3; c++) {
    out.push({ compound1: COMPS[c], gear: g / 10, pitLap: null });
    for (p = 1; p <= laps - 1; p++) for (c2 = 0; c2 < 3; c2++)
      out.push({ compound1: COMPS[c], compound2: COMPS[c2], gear: g / 10, pitLap: p });
  }
  return out;
}
function bestSetup(spec, carId, parts, weatherView) {
  var s = weatherView || spec, best = null, bt = Infinity;
  candidates(spec.laps).forEach(function (cd) {
    var t = run(s, carId, parts, cd).player.total;
    if (t < bt) { bt = t; best = cd; }
  });
  return best;
}

/* Políticas de jogador */
var POLICIES = {
  casual: function () { return { compound1: 'medium', gear: 0.5, pitLap: null }; },
  dicas: function (spec) {      // segue as dicas visíveis: câmbio da pista e pneu pela previsão
    var tr = spec.track, f = spec.forecast, wearEff = tr.wear * spec.tempMult;
    var comp = f === 'rain' ? 'hard' : (wearEff >= 1.3 ? 'hard' : (wearEff <= 0.95 ? 'soft' : 'medium'));
    var g = E.gearOptFor(tr, f, null) + ((E.hash(spec.seed + 'dicas') % 100) / 100 - 0.5) * 0.3;
    return { compound1: comp, gear: Math.min(1, Math.max(0, g)), pitLap: null };
  },
  otimo: function (spec, carId, parts) {  // melhor ajuste conhecendo só a previsão
    return bestSetup(spec, carId, parts, withWeather(spec, spec.forecast));
  }
};

function avg(a) { var s = 0; a.forEach(function (x) { s += x; }); return a.length ? s / a.length : 0; }
function pct(n, d) { return (100 * n / d).toFixed(1) + '%'; }
var MAXP = { motor: 5, freios: 5, suspensao: 5, aero: 5, peso: 5 };
var NOP = { motor: 0, freios: 0, suspensao: 0, aero: 0, peso: 0 };

/* 1) Posição média por política, carro sem melhorias x carro no máximo */
function reportPositions(specs, carId) {
  console.log('\n== Posição média e vitórias (' + specs.length + ' corridas, carro: ' + carId + ') ==');
  Object.keys(POLICIES).forEach(function (pn) {
    [['sem melhorias', NOP], ['tudo no nível 5', MAXP]].forEach(function (pp) {
      var pos = [], wins = 0, pod = 0;
      specs.forEach(function (sp) {
        var r = run(sp, carId, pp[1], POLICIES[pn](sp, carId, pp[1]));
        pos.push(r.playerPos); if (r.playerPos === 1) wins++; if (r.playerPos <= 3) pod++;
      });
      console.log(('  ' + pn + ' / ' + pp[0] + ':').padEnd(34) + 'posição média ' + avg(pos).toFixed(2) +
        ' | vitórias ' + pct(wins, specs.length) + ' | pódios ' + pct(pod, specs.length));
    });
  });
}

/* 2) Nenhuma opção deve ser sempre a melhor: frequência do melhor ajuste com clima real */
function reportDominance(specs, carId) {
  console.log('\n== Qual ajuste foi o melhor (conhecendo o clima real), carro ' + carId + ' ==');
  var byComp = { soft: 0, medium: 0, hard: 0 }, pit = 0, nopit = 0, gearBuckets = [0, 0, 0];
  var byTrackComp = {}, n = 0;
  specs.forEach(function (sp) {
    var b = bestSetup(sp, carId, NOP); n++;
    byComp[b.compound1]++;
    if (b.pitLap) pit++; else nopit++;
    gearBuckets[b.gear < 0.34 ? 0 : (b.gear < 0.67 ? 1 : 2)]++;
    var key = sp.track.id + '/' + (sp.weatherByLap.indexOf('rain') !== -1 ? 'chuva' : 'seco');
    byTrackComp[key] = byTrackComp[key] || { soft: 0, medium: 0, hard: 0, pit: 0, n: 0 };
    byTrackComp[key][b.compound1]++; byTrackComp[key].n++; if (b.pitLap) byTrackComp[key].pit++;
  });
  console.log('  pneu inicial  macio ' + pct(byComp.soft, n) + ' | médio ' + pct(byComp.medium, n) + ' | duro ' + pct(byComp.hard, n));
  console.log('  box           sem parada ' + pct(nopit, n) + ' | 1 parada ' + pct(pit, n));
  console.log('  câmbio        curto ' + pct(gearBuckets[0], n) + ' | médio ' + pct(gearBuckets[1], n) + ' | longo ' + pct(gearBuckets[2], n));
  Object.keys(byTrackComp).sort().forEach(function (k) {
    var o = byTrackComp[k];
    console.log('    ' + k.padEnd(18) + 'macio ' + pct(o.soft, o.n).padStart(6) + ' médio ' + pct(o.medium, o.n).padStart(6) +
      ' duro ' + pct(o.hard, o.n).padStart(6) + ' | com box ' + pct(o.pit, o.n).padStart(6) + ' (' + o.n + ')');
  });
}

/* 3) Economia: dias para chegar ao carro no máximo e evolução da posição */
function economy(policyName, days, carId) {
  var parts = Object.assign({}, NOP), coins = 0, maxDay = null, hist = [], streak = 0;
  var dl = dayList(days, '2026-12-01'), pol = POLICIES[policyName];
  dl.forEach(function (d, di) {
    streak++;
    var posDay = [], coinDay = 0;
    for (var i = 1; i <= E.CFG.RACES_PER_DAY; i++) {
      var sp = E.getRaceSpec(d, i);
      var r = run(sp, carId, parts, pol(sp, carId, parts));
      posDay.push(r.playerPos); coins += r.coins.total; coinDay += r.coins.total;
      if (i === 1) { var b = E.streakBonus(streak); coins += b; coinDay += b; }
      // compra: sempre a peça mais barata disponível
      var progress = true;
      while (progress) {
        progress = false;
        var cands = E.PARTS.filter(function (p) { return (parts[p.id] || 0) < E.CFG.MAX_LEVEL; })
          .map(function (p) { return { id: p.id, cost: E.upgradeCost((parts[p.id] || 0) + 1) }; })
          .sort(function (a, b) { return a.cost - b.cost; });
        if (cands.length && coins >= cands[0].cost) { coins -= cands[0].cost; parts[cands[0].id]++; progress = true; }
      }
    }
    if (maxDay === null && E.totalLevels(parts) === E.PARTS.length * E.CFG.MAX_LEVEL) maxDay = di + 1;
    hist.push({ day: di + 1, pos: avg(posDay), coins: coinDay, levels: E.totalLevels(parts) });
  });
  return { maxDay: maxDay, hist: hist };
}
function reportEconomy(policyName, days, carId) {
  var r = economy(policyName, days, carId);
  console.log('\n== Economia (' + policyName + ', ' + carId + ', ' + days + ' dias jogando todo dia) ==');
  console.log('  carro no nível máximo no dia: ' + (r.maxDay === null ? 'não chegou em ' + days + ' dias' : r.maxDay));
  var blocks = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30]];
  blocks.forEach(function (b) {
    var h = r.hist.filter(function (x) { return x.day >= b[0] && x.day <= b[1]; });
    if (!h.length) return;
    console.log('  dias ' + b[0] + '-' + b[1] + ': posição média ' + avg(h.map(function (x) { return x.pos; })).toFixed(2) +
      ' | moedas/dia ' + Math.round(avg(h.map(function (x) { return x.coins; }))) +
      ' | níveis ao fim ' + h[h.length - 1].levels + '/25');
  });
  return r;
}

/* 4) Os 7 carros: posição média com a mesma política */
function reportCars(specs) {
  console.log('\n== Os 7 carros sem melhorias (política: dicas) ==');
  E.CARS.forEach(function (c) {
    var pos = specs.map(function (sp) { return run(sp, c.id, NOP, POLICIES.dicas(sp)).playerPos; });
    console.log('  ' + c.name.padEnd(10) + 'posição média ' + avg(pos).toFixed(2));
  });
}

/* 5) Tabela de clima/pista do calendário (variedade) */
function reportVariety(days) {
  var seen = {}, tot = 0, wch = 0;
  dayList(days).forEach(function (d) {
    for (var i = 1; i <= 10; i++) {
      var sp = E.getRaceSpec(d, i);
      var k = sp.track.id + '|' + sp.forecast; seen[k] = (seen[k] || 0) + 1; tot++;
      if (sp.changeLap) wch++;
    }
  });
  console.log('\n== Variedade do calendário (' + days + ' dias) ==');
  console.log('  combinações pista+previsão usadas: ' + Object.keys(seen).length + ' de ' + (E.TRACKS.length * 3));
  console.log('  previsão errada: ' + pct(wch, tot) + ' (meta ~20%)');
}

/* Execução */
var t0 = Date.now();
var nDays = quick ? 20 : 100;
var specs = allSpecs(dayList(nDays));
reportVariety(nDays);
reportCars(specs.slice(0, quick ? 100 : 400));
reportPositions(specs.slice(0, quick ? 100 : 300), 'sabia');
reportDominance(specs.slice(0, quick ? 60 : 200), 'sabia');
['casual', 'dicas', 'otimo'].forEach(function (p) {
  reportEconomy(p, quick ? 12 : 30, 'sabia');
});
console.log('\n(tempo: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
