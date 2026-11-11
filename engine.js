/* Box 10 - motor do jogo.
 * Roda no navegador (window.Box10Engine) e no Node (require) para testes de equilíbrio.
 * Toda a aleatoriedade vem de sementes (data + número da corrida), então o desafio do dia
 * é igual para todos e o resultado de uma corrida é sempre o mesmo para o mesmo acerto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Box10Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------
   * CONFIGURAÇÃO DE EQUILÍBRIO (tudo que se ajusta fica aqui)
   * ------------------------------------------------------------- */
  var CFG = {
    RACES_PER_DAY: 10,
    LAUNCH_DATE: '2026-11-12',   // dia #1 do jogo (data de Brasília)
    TZ_OFFSET_HOURS: -3,         // fuso de Brasília: o dia vira à meia-noite daqui
    GAMMA: 0.55,                 // sensibilidade do tempo de volta aos atributos
    GEAR_K: 0.07,                // custo de errar o câmbio (fração do tempo de volta)
    WEAR_K: 0.009,               // desgaste de pneu
    PIT_LOSS: 0.17,              // tempo perdido no box (fração do tempo de volta)
    NOISE: 0.004,                // aleatoriedade do jogador por volta
    RAIN_MULT: 1.12,
    CLOUDY_MULT: 1.01,
    FORECAST_WRONG: 0.2,         // chance de a previsão errar
    RIVAL_START: 1.02,           // rivais começam ~3% abaixo do carro base do jogador
    RIVAL_FOLLOW: 0.85,           // quanto da evolução do jogador os rivais acompanham
    COINS_BY_POS: [120, 90, 70, 50, 35, 25],
    FASTEST_BONUS: 15,
    STREAK_STEP: 25,             // bônus por dia de sequência (até STREAK_MAX_DAYS)
    STREAK_MAX_DAYS: 7,
    CAR_PRICE: 3500,
    UPGRADE_COSTS: [350, 550, 830, 1170, 1650], // custo para chegar ao nível 1..5
    MAX_LEVEL: 5
  };

  var ATTR_KEYS = ['accel', 'top', 'grip', 'brake', 'leve', 'tire'];

  /* Carros 100% fictícios (soma dos atributos = 38 em todos; nenhum é o melhor em tudo). */
  var CARS = [
    { id: 'sabia', name: 'Sabiá', color: '#f4b400',
      tagline: 'Equilibrado e perdoa erros de ajuste. Ótimo para começar.',
      attrs: { accel: 6, top: 6, grip: 7, brake: 6, leve: 7, tire: 6 } },
    { id: 'gazela', name: 'Gazela', color: '#e53935',
      tagline: 'Leve e ágil: brilha na saída das curvas.',
      attrs: { accel: 8, top: 5, grip: 6, brake: 6, leve: 8, tire: 5 } },
    { id: 'tatu', name: 'Tatu', color: '#43a047',
      tagline: 'Colado no chão, forte na chuva e gentil com os pneus.',
      attrs: { accel: 5, top: 6, grip: 8, brake: 7, leve: 5, tire: 8 } },
    { id: 'relampago', name: 'Relâmpago', color: '#1e88e5',
      tagline: 'Vira foguete nas retas, mas sofre nas curvas lentas.',
      attrs: { accel: 6, top: 9, grip: 5, brake: 6, leve: 6, tire: 6 } },
    { id: 'capivara', name: 'Capivara', color: '#8d6e63',
      tagline: 'Calma e resistente: pneus duram muito.',
      attrs: { accel: 5, top: 5, grip: 7, brake: 7, leve: 6, tire: 8 } },
    { id: 'onca', name: 'Onça', color: '#fb8c00',
      tagline: 'Bote forte em tudo, sem ponto fraco evidente.',
      attrs: { accel: 7, top: 7, grip: 6, brake: 6, leve: 6, tire: 6 } },
    { id: 'tucano', name: 'Tucano', color: '#8e24aa',
      tagline: 'Rápido e leve, mas os freios pedem cuidado.',
      attrs: { accel: 7, top: 7, grip: 6, brake: 4, leve: 7, tire: 7 } }
  ];

  var PARTS = [
    { id: 'motor', name: 'Motor', effects: { accel: 0.03, top: 0.02 },
      desc: 'Mais aceleração e um pouco de velocidade final.' },
    { id: 'freios', name: 'Freios', effects: { brake: 0.04 },
      desc: 'Frear mais tarde nas curvas lentas.' },
    { id: 'suspensao', name: 'Suspensão', effects: { grip: 0.03, tire: 0.02 },
      desc: 'Mais aderência e pneus que duram mais.' },
    { id: 'aero', name: 'Aerodinâmica', effects: { top: 0.015, grip: 0.015 },
      desc: 'Ajuda nas curvas rápidas e nas retas.' },
    { id: 'peso', name: 'Redução de peso', effects: { leve: 0.04 },
      desc: 'Carro mais leve: melhora tudo um pouco.' }
  ];

  var COMPOUNDS = {
    soft:   { id: 'soft',   name: 'Macio', rate: 1.5,  grip: { dry: 1.07, cloudy: 1.04, rain: 0.90 } },
    medium: { id: 'medium', name: 'Médio', rate: 0.85, grip: { dry: 1.00, cloudy: 1.00, rain: 0.97 } },
    hard:   { id: 'hard',   name: 'Duro',  rate: 0.60, grip: { dry: 0.94, cloudy: 0.97, rain: 1.02 } }
  };

  var TEMPS = {
    cold: { id: 'cold', mult: 0.85 },
    mild: { id: 'mild', mult: 1.0 },
    hot:  { id: 'hot',  mult: 1.25 }
  };

  /* Pistas: s = % de retas, c1 = curvas lentas, c2 = curvas rápidas (somam 1).
   * T = tempo base da volta (s), wear = castigo nos pneus, gearOpt = câmbio ideal (0 curto, 1 longo). */
  var TRACKS = [
    { id: 'planalto', name: 'Autódromo Planalto', s: 0.55, c1: 0.15, c2: 0.30, laps: 4, T: 62, wear: 0.9, gearOpt: 0.8,
      tip: 'Retas longas pedem câmbio longo.',
      points: [[8, 50], [20, 25], [50, 18], [80, 22], [93, 45], [85, 70], [60, 78], [45, 65], [30, 78], [12, 72]] },
    { id: 'serra', name: 'Circuito Serra Fina', s: 0.20, c1: 0.55, c2: 0.25, laps: 5, T: 78, wear: 1.0, gearOpt: 0.2,
      tip: 'Muitas curvas lentas pedem câmbio curto e bons freios.',
      points: [[15, 20], [35, 12], [50, 28], [40, 42], [65, 40], [85, 28], [92, 50], [75, 62], [82, 82], [55, 88], [40, 72], [22, 82], [8, 60], [22, 45]] },
    { id: 'cidade', name: 'Circuito Cidade Azul', s: 0.38, c1: 0.28, c2: 0.34, laps: 4, T: 70, wear: 1.0, gearOpt: 0.5,
      tip: 'Pista equilibrada: câmbio no meio-termo.',
      points: [[15, 45], [28, 20], [55, 14], [80, 25], [90, 48], [72, 60], [78, 80], [50, 88], [28, 78], [20, 62]] },
    { id: 'pedras', name: 'Pista das Pedras', s: 0.30, c1: 0.25, c2: 0.45, laps: 5, T: 72, wear: 1.55, gearOpt: 0.45,
      tip: 'Curvas rápidas castigam os pneus. Pense na durabilidade.',
      points: [[12, 35], [30, 15], [58, 20], [75, 10], [92, 30], [80, 50], [92, 70], [65, 88], [40, 80], [25, 90], [8, 68], [20, 50]] }
  ];

  /* Rivais fictícios. Multiplicadores < 1 deixam o piloto mais rápido naquela condição. */
  var RIVALS = [
    { id: 'bruno', name: 'Bruno Brasa', style: 'O agressivo', color: '#ff5252', noise: 0.007, dry: 0.992, rain: 1.012 },
    { id: 'cida', name: 'Dona Cida', style: 'A econômica', color: '#26c6da', noise: 0.0025 },
    { id: 'ze', name: 'Zé da Chuva', style: 'O chuvoso', color: '#7986cb', noise: 0.004, dry: 1.006, rain: 0.982 },
    { id: 'leo', name: 'Léo Retão', style: 'O das retas', color: '#f06292', noise: 0.004, retas: 0.985, curvas: 1.008 },
    { id: 'marisa', name: 'Marisa Metódica', style: 'A metódica', color: '#cfd8dc', noise: 0.002 }
  ];

  /* ---------------------------------------------------------------
   * Utilidades: hash, gerador pseudoaleatório, datas
   * ------------------------------------------------------------- */
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(key) { return mulberry32(hash(key)); }
  function gauss(r) {
    var u = 0, v;
    while (u === 0) u = r();
    v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function dayKey(now) {
    var ms = (now === undefined ? Date.now() : now) + CFG.TZ_OFFSET_HOURS * 3600000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  function dayDiff(a, b) {
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  }
  function dayNumber(key) { return Math.max(1, dayDiff(key, CFG.LAUNCH_DATE) + 1); }
  function msToNextDay(now) {
    var ms = (now === undefined ? Date.now() : now) + CFG.TZ_OFFSET_HOURS * 3600000;
    return (Math.floor(ms / 86400000) + 1) * 86400000 - ms;
  }

  function getCar(id) { for (var i = 0; i < CARS.length; i++) if (CARS[i].id === id) return CARS[i]; return CARS[0]; }
  function getTrack(id) { for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i]; return TRACKS[0]; }

  /* ---------------------------------------------------------------
   * Carro e melhorias
   * ------------------------------------------------------------- */
  function upgradedAttrs(carId, parts) {
    var car = getCar(carId), mult = {}, out = {};
    ATTR_KEYS.forEach(function (k) { mult[k] = 1; });
    PARTS.forEach(function (p) {
      var lv = (parts && parts[p.id]) || 0;
      for (var k in p.effects) mult[k] += lv * p.effects[k];
    });
    ATTR_KEYS.forEach(function (k) { out[k] = car.attrs[k] * mult[k]; });
    return out;
  }
  function carGain(carId, parts) {
    var base = getCar(carId).attrs, up = upgradedAttrs(carId, parts), s = 0;
    ATTR_KEYS.forEach(function (k) { s += up[k] / base[k] - 1; });
    return s / ATTR_KEYS.length;
  }
  function upgradeCost(nextLevel) { return CFG.UPGRADE_COSTS[nextLevel - 1]; }
  function totalLevels(parts) {
    var n = 0; PARTS.forEach(function (p) { n += (parts && parts[p.id]) || 0; }); return n;
  }

  /* ---------------------------------------------------------------
   * Calendário do dia: pista, clima, rivais (iguais para todos)
   * ------------------------------------------------------------- */
  function shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function trackOrder(day) {
    var r = rngFor('box10|order|' + day), order = [], bag;
    while (order.length < CFG.RACES_PER_DAY) {
      bag = shuffle(TRACKS.map(function (t) { return t.id; }), r);
      if (order.length && bag[0] === order[order.length - 1]) { var x = bag[0]; bag[0] = bag[1]; bag[1] = x; }
      order = order.concat(bag);
    }
    return order.slice(0, CFG.RACES_PER_DAY);
  }

  function getRaceSpec(day, idx) {
    var seed = 'box10|' + day + '|' + idx;
    var r = rngFor(seed);
    var track = getTrack(trackOrder(day)[idx - 1]);

    var f = r(), forecast = f < 0.5 ? 'dry' : (f < 0.75 ? 'cloudy' : 'rain');
    var t = r(), temp;
    if (forecast === 'rain') temp = t < 0.5 ? 'cold' : 'mild';
    else temp = t < 0.25 ? 'cold' : (t < 0.7 ? 'mild' : 'hot');

    var weatherByLap = [], changeLap = null, changedTo = null, i;
    for (i = 0; i < track.laps; i++) weatherByLap.push(forecast);
    if (r() < CFG.FORECAST_WRONG) {
      changeLap = 2 + Math.floor(r() * (track.laps - 1));
      var q = r();
      if (forecast === 'rain') changedTo = q < 0.7 ? 'dry' : 'cloudy';
      else if (forecast === 'dry') changedTo = q < 0.75 ? 'rain' : 'cloudy';
      else changedTo = q < 0.5 ? 'rain' : 'dry';
      for (i = changeLap - 1; i < track.laps; i++) weatherByLap[i] = changedTo;
    }

    var rivalCars = RIVALS.map(function (rv) {
      return { rival: rv, carId: CARS[Math.floor(r() * CARS.length)].id };
    });

    return {
      seed: seed, day: day, idx: idx, track: track, laps: track.laps,
      forecast: forecast, temp: temp, tempMult: TEMPS[temp].mult,
      weatherByLap: weatherByLap, changeLap: changeLap, changedTo: changedTo,
      rivalCars: rivalCars
    };
  }

  /* ---------------------------------------------------------------
   * Simulação
   * ------------------------------------------------------------- */
  function gearOptFor(track, weather, attrs) {
    var o = track.gearOpt + (weather === 'rain' ? -0.15 : 0) + 0.04 * (attrs ? attrs.accel - attrs.top : 0);
    return clamp(o, 0, 1);
  }

  function normalizeSetup(su, laps) {
    su = su || {};
    var c1 = COMPOUNDS[su.compound1] ? su.compound1 : 'medium';
    var pit = su.pitLap ? Math.round(su.pitLap) : null;
    if (pit !== null && (pit < 1 || pit > laps - 1)) pit = null;
    var c2 = pit !== null && COMPOUNDS[su.compound2] ? su.compound2 : c1;
    return { compound1: c1, compound2: c2, pitLap: pit, gear: clamp(su.gear === undefined ? 0.5 : su.gear, 0, 1) };
  }

  function wearPenalty(d, lap, spec) {
    var su = d.setup, pitted = su.pitLap && lap > su.pitLap;
    var comp = COMPOUNDS[pitted ? su.compound2 : su.compound1];
    var age = pitted ? lap - su.pitLap - 1 : lap - 1;
    var tdF = Math.max(0.3, (11 - d.attrs.tire) / 5);
    return CFG.WEAR_K * comp.rate * spec.track.wear * spec.tempMult * tdF * Math.pow(age, 1.5);
  }

  function lapTime(d, lap, spec) {
    var tr = spec.track, w = spec.weatherByLap[lap - 1], su = d.setup, a = d.attrs;
    var pitted = su.pitLap && lap > su.pitLap;
    var comp = COMPOUNDS[pitted ? su.compound2 : su.compound1];
    var rain = w === 'rain';
    var grip = a.grip * comp.grip[w];
    var pS = rain ? 0.35 * a.top + 0.65 * a.accel : 0.55 * a.top + 0.45 * a.accel;
    var pC1 = rain ? 0.62 * grip + 0.28 * a.brake + 0.10 * a.accel : 0.50 * grip + 0.35 * a.brake + 0.15 * a.accel;
    var pC2 = rain ? 0.80 * grip + 0.20 * a.leve : 0.65 * grip + 0.20 * a.leve + 0.15 * a.top;
    var wf = 1 + 0.015 * (a.leve - 6), G = CFG.GAMMA;
    var base = tr.T * (tr.s * Math.pow(6 / (pS * wf), G) + tr.c1 * Math.pow(6 / (pC1 * wf), G) + tr.c2 * Math.pow(6 / (pC2 * wf), G));
    var weatherMult = rain ? CFG.RAIN_MULT : (w === 'cloudy' ? CFG.CLOUDY_MULT : 1);
    var gearMult = 1 + CFG.GEAR_K * Math.abs(su.gear - gearOptFor(tr, w, a));
    var mods = d.mods || {};
    var mm = rain ? (mods.rain || 1) : (mods.dry || 1);
    if (tr.s >= 0.4) mm *= (mods.retas || 1);
    if (tr.s <= 0.3) mm *= (mods.curvas || 1);
    var nz = 1 + (d.noise || CFG.NOISE) * clamp(gauss(rngFor(spec.seed + '|n|' + d.id + '|' + lap)), -2.5, 2.5);
    var t = base * weatherMult * gearMult * (1 + wearPenalty(d, lap, spec)) * mm * nz;
    if (su.pitLap && lap === su.pitLap) t += tr.T * CFG.PIT_LOSS;
    return t;
  }

  function rivalSetup(rv, spec) {
    var tr = spec.track, f = spec.forecast, wearEff = tr.wear * spec.tempMult;
    var r = rngFor(spec.seed + '|setup|' + rv.id);
    var opt = gearOptFor(tr, f, null), comp, gear = opt, pit = null, comp2 = null;
    switch (rv.id) {
      case 'bruno':   // agressivo: sempre pneu macio e nunca para
        comp = f === 'rain' ? 'medium' : 'soft'; gear = opt + (r() - 0.5) * 0.3; break;
      case 'cida':    // econômica: pneu duro sempre
        comp = 'hard'; gear = opt + (r() - 0.5) * 0.2; break;
      case 'ze':      // chuvoso: médio no seco, duro na chuva
        comp = f === 'rain' ? 'hard' : 'medium'; gear = opt + (r() - 0.5) * 0.25; break;
      case 'leo':     // retas: câmbio mais longo que o ideal
        comp = f === 'rain' ? 'hard' : (wearEff < 1.0 ? 'soft' : 'medium'); gear = opt + 0.15 + (r() - 0.5) * 0.1; break;
      default:        // metódica: escolhe quase sempre certo, e para no box quando compensa
        if (f === 'rain') comp = 'hard';
        else if (wearEff < 0.88) comp = 'soft';
        else if (wearEff < 1.4) comp = 'medium';
        else { comp = 'soft'; pit = Math.ceil(spec.laps / 2); comp2 = 'medium'; }
        gear = opt;
    }
    return { compound1: comp, compound2: comp2 || comp, pitLap: pit, gear: clamp(gear, 0, 1) };
  }

  function buildDrivers(spec, player) {
    var pSetup = normalizeSetup(player.setup, spec.laps);
    var pAttrs = upgradedAttrs(player.carId, player.parts);
    var gain = carGain(player.carId, player.parts);
    var drivers = [{
      id: 'player', name: 'Você', style: 'Engenheiro', isPlayer: true,
      color: getCar(player.carId).color, carId: player.carId,
      attrs: pAttrs, setup: pSetup, mods: {}, noise: CFG.NOISE
    }];
    spec.rivalCars.forEach(function (rc) {
      var rv = rc.rival, car = getCar(rc.carId);
      var rr = rngFor(spec.seed + '|rm|' + rv.id);
      var mult = CFG.RIVAL_START + CFG.RIVAL_FOLLOW * gain + 0.012 * clamp(gauss(rr), -2, 2);
      var attrs = {};
      ATTR_KEYS.forEach(function (k) { attrs[k] = car.attrs[k] * mult; });
      drivers.push({
        id: rv.id, name: rv.name, style: rv.style, isPlayer: false, color: rv.color, carId: rc.carId,
        attrs: attrs, setup: rivalSetup(rv, spec), mods: rv, noise: rv.noise
      });
    });
    return drivers;
  }

  function raceCoins(pos, hasFastest) {
    var base = CFG.COINS_BY_POS[pos - 1] || 0;
    var fast = hasFastest ? CFG.FASTEST_BONUS : 0;
    return { base: base, fastest: fast, total: base + fast };
  }

  function simulateRace(spec, player) {
    var drivers = buildDrivers(spec, player), i, lap;
    drivers.forEach(function (d) {
      var cum = 0, laps = [], cums = [], best = Infinity;
      for (lap = 1; lap <= spec.laps; lap++) {
        var t = lapTime(d, lap, spec);
        laps.push(t); cum += t; cums.push(cum);
        var clean = (d.setup.pitLap && lap === d.setup.pitLap) ? t - spec.track.T * CFG.PIT_LOSS : t;
        if (clean < best) best = clean;
      }
      d.laps = laps; d.cums = cums; d.total = cum; d.best = best;
    });
    var order = drivers.slice().sort(function (a, b) { return a.total - b.total; });
    var fastest = drivers.slice().sort(function (a, b) { return a.best - b.best; })[0];
    order.forEach(function (d, k) { d.pos = k + 1; d.gap = d.total - order[0].total; });
    var me = drivers[0];
    var coins = raceCoins(me.pos, fastest.id === 'player');
    return {
      spec: spec, order: order, drivers: drivers, player: me, playerPos: me.pos,
      fastestId: fastest.id, coins: coins, hint: chiefHint(spec, me)
    };
  }

  /* Comentário do chefe de equipe: o que mais pesou no resultado. */
  function chiefHint(spec, me) {
    var su = me.setup, tr = spec.track, laps = spec.laps, lap, rainLaps = 0, softRain = 0;
    var devSum = 0, wearSum = 0;
    for (lap = 1; lap <= laps; lap++) {
      var w = spec.weatherByLap[lap - 1];
      var pitted = su.pitLap && lap > su.pitLap;
      var comp = pitted ? su.compound2 : su.compound1;
      if (w === 'rain') { rainLaps++; if (comp === 'soft') softRain++; }
      devSum += su.gear - gearOptFor(tr, w, me.attrs);
      wearSum += wearPenalty(me, lap, spec);
    }
    var devAvg = devSum / laps, wearAvg = wearSum / laps;
    if (me.pos === 1) return { code: 'win' };
    if (rainLaps && softRain * 2 > rainLaps) return { code: 'rain_soft' };
    if (spec.changeLap && spec.changedTo === 'rain' && !su.pitLap) return { code: 'rain_surprise', lap: spec.changeLap };
    if (devAvg > 0.22) return { code: 'gear_too_long' };
    if (devAvg < -0.22) return { code: 'gear_too_short' };
    if (wearAvg > 0.05 && !su.pitLap) return { code: 'tires_worn' };
    if (su.compound1 === 'hard' && spec.forecast !== 'rain' && tr.wear * spec.tempMult < 1.0 && !spec.changeLap) return { code: 'dry_hard' };
    if (me.pos <= 3) return { code: 'podium' };
    return { code: 'ok' };
  }

  /* Fila de moedas do dia: sequência de dias (bônus pago após a 1ª corrida do dia). */
  function streakBonus(streak) {
    return CFG.STREAK_STEP * Math.min(Math.max(streak, 1), CFG.STREAK_MAX_DAYS);
  }

  return {
    CFG: CFG, ATTR_KEYS: ATTR_KEYS, CARS: CARS, PARTS: PARTS, COMPOUNDS: COMPOUNDS, TEMPS: TEMPS,
    TRACKS: TRACKS, RIVALS: RIVALS,
    hash: hash, rngFor: rngFor, dayKey: dayKey, dayDiff: dayDiff, dayNumber: dayNumber, msToNextDay: msToNextDay,
    getCar: getCar, getTrack: getTrack, upgradedAttrs: upgradedAttrs, carGain: carGain,
    upgradeCost: upgradeCost, totalLevels: totalLevels, getRaceSpec: getRaceSpec, trackOrder: trackOrder,
    gearOptFor: gearOptFor, normalizeSetup: normalizeSetup, simulateRace: simulateRace,
    raceCoins: raceCoins, streakBonus: streakBonus, wearPenalty: wearPenalty
  };
});
