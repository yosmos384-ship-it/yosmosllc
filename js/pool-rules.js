// pool-rules.js — V12 POOL: WPA 8-ball (World Standardized Rules) + 9-ball rules engine. Pure logic, no THREE / DOM.
// Ball ids: 0 = cue ball, 1–7 solids, 8 = the 8-ball, 9–15 stripes (9-ball: 1–9).
// A shot is described by what the physics recorded (see summarizeShot):
//   { first: id | null, railAfter: bool, pocketed: [{id, pocket}], railBalls: count of object balls that hit a rail,
//     offTable: [ids], scratch: bool, called: pocket id | null }
export const SOLIDS = [1, 2, 3, 4, 5, 6, 7], STRIPES = [9, 10, 11, 12, 13, 14, 15];
export const groupOf = (n) => (n >= 1 && n <= 7 ? 'solids' : n >= 9 && n <= 15 ? 'stripes' : n === 8 ? 'eight' : null);

/** turn the physics event log of one shot into the rules summary */
export function summarizeShot(events, o = {}) {
  let first = null, firstT = Infinity, railAfter = false;
  const pocketed = [], rails = new Set();
  for (const e of events) {
    if (e.type === 'ball' && first === null && (e.a === 0 || e.b === 0)) { first = e.a === 0 ? e.b : e.a; firstT = e.t; }
  }
  for (const e of events) {
    if (e.type === 'cush') { if (e.a !== 0) rails.add(e.a); if (first !== null && e.t >= firstT) railAfter = true; }
    if (e.type === 'pocket') { pocketed.push({ id: e.a, pocket: e.p }); if (first !== null && e.t >= firstT) railAfter = true; }
  }
  return { first, railAfter, pocketed, railBalls: rails.size, offTable: o.offTable || [], scratch: pocketed.some((p) => p.id === 0), called: o.called == null ? null : o.called };
}

export function createRules(game = '8', o = {}) {
  const R = {
    game: game === '9' ? '9' : '8', raceTo: o.raceTo || 3,
    names: o.names || ['P1', 'P2'],
    score: [0, 0], frame: 0, breaker: 0, matchOver: false, matchWinner: -1,
    // frame state
    turn: 0, groups: [null, null], open: true, isBreak: true, ballInHand: 'kitchen', onTable: new Set(), fouls: [0, 0],
    frameOver: false, winner: -1, lastResult: null,
    newMatch() { R.score = [0, 0]; R.frame = 0; R.breaker = 0; R.matchOver = false; R.matchWinner = -1; R.startFrame(0); },
    startFrame(breaker = R.breaker) {
      R.breaker = breaker; R.turn = breaker; R.groups = [null, null]; R.open = true; R.isBreak = true; R.ballInHand = 'kitchen';
      R.onTable = new Set(R.game === '9' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      R.fouls = [0, 0]; R.frameOver = false; R.winner = -1; R.lastResult = null;
    },
    /** independent copy (the AI tries shots on it) */
    clone() {
      const C = createRules(R.game, { raceTo: R.raceTo, names: R.names.slice() });
      for (const k of ['score', 'groups', 'fouls']) C[k] = R[k].slice();
      for (const k of ['frame', 'breaker', 'matchOver', 'matchWinner', 'turn', 'open', 'isBreak', 'ballInHand', 'frameOver', 'winner']) C[k] = R[k];
      C.onTable = new Set(R.onTable); return C;
    },
    groupBalls(p) { const g = R.groups[p]; if (!g) return []; return (g === 'solids' ? SOLIDS : STRIPES).filter((n) => R.onTable.has(n)); },
    /** is player p (default: shooter) shooting at the 8 (8-ball) */
    onEight(p = R.turn) { return R.game === '8' && !R.open && !!R.groups[p] && R.groupBalls(p).length === 0; },
    lowest() { let m = 99; for (const n of R.onTable) if (n < m) m = n; return m === 99 ? null : m; },
    /** ball ids the shooter may legally contact first */
    legalFirst(p = R.turn) {
      if (R.game === '9') { const l = R.lowest(); return l ? [l] : []; }
      if (R.isBreak) return [...R.onTable];
      if (R.onEight(p)) return [8];
      if (R.open) return [...R.onTable].filter((n) => n !== 8);
      return R.groupBalls(p);
    },
    needsCall() { return R.game === '8' && !R.isBreak && R.onEight(); },
    /** apply one shot; returns the result (also kept in lastResult) */
    shot(S) {
      const me = R.turn, opp = 1 - me, msgs = [];
      const res = { shooter: me, foul: false, fouls: [], next: me, ballInHand: null, frameOver: false, winner: -1, loss: false, reason: '', assigned: null, respot: [], rerack: false, msgs, continueTurn: false };
      const potIds = S.pocketed.map((p) => p.id).filter((n) => n !== 0);
      const wasOnEight = R.onEight(me);
      const wasBreak = R.isBreak;
      const lowestBefore = R.lowest();
      // ---------- fouls
      const foul = (code) => { if (!res.fouls.includes(code)) res.fouls.push(code); res.foul = true; };
      if (S.scratch) foul('scratch');
      if ((S.offTable || []).length) foul('offTable');
      if (S.first === null) foul('noHit');
      else if (R.game === '9') { if (S.first !== lowestBefore) foul('wrongFirst'); }
      else if (!wasBreak) {
        if (wasOnEight) { if (S.first !== 8) foul('wrongFirst'); }
        else if (R.open) { if (S.first === 8) foul('eightFirst'); }
        else if (groupOf(S.first) !== R.groups[me]) foul('wrongFirst');
      }
      if (S.first !== null && !potIds.length && !S.railAfter && !(wasBreak)) foul('noRail');
      // remove pocketed balls
      for (const n of potIds) R.onTable.delete(n);
      for (const n of S.offTable || []) R.onTable.delete(n);
      if (R.game === '8') eightBall(); else nineBall();
      R.isBreak = false;
      if (res.foul) R.fouls[me]++; else R.fouls[me] = 0;
      if (!res.frameOver) {
        res.next = res.continueTurn ? me : opp;
        if (res.foul) res.ballInHand = res.ballInHand || 'anywhere';
        R.turn = res.next; R.ballInHand = res.ballInHand;
      } else {
        R.frameOver = true; R.winner = res.winner; R.score[res.winner]++; R.frame++;
        R.ballInHand = null;
        if (R.score[res.winner] >= R.raceTo) { R.matchOver = true; R.matchWinner = res.winner; }
        R.breaker = 1 - R.breaker; // alternate break
      }
      if (!res.frameOver) res.reason = res.fouls[0] || res.reason;
      R.lastResult = res;
      return res;

      function eightBall() {
        const eightDown = potIds.includes(8) || (S.offTable || []).includes(8);
        if (wasBreak) {
          const legalBreak = potIds.length > 0 || S.railBalls >= 4;
          if (eightDown) { // WPA 8-ball on the break: re-spot the 8 (breaker keeps shooting unless he scratched)
            res.respot.push(8); R.onTable.add(8); msgs.push('eightOnBreak');
          }
          if (!legalBreak && !res.foul) { res.rerack = true; res.reason = 'illegalBreak'; msgs.push('illegalBreak'); res.continueTurn = false; R.breaker = opp; return; }
          if (res.foul) { res.ballInHand = 'kitchen'; return; } // scratch on the break: ball in hand behind the head string
          res.continueTurn = potIds.some((n) => n !== 8);
          return; // table stays open after the break
        }
        if (eightDown) {
          res.frameOver = true;
          const rightPocket = S.called == null || S.pocketed.some((p) => p.id === 8 && p.pocket === S.called);
          if (wasOnEight && !res.foul && rightPocket) { res.winner = me; res.reason = 'eightWin'; }
          else { res.winner = opp; res.loss = true; res.reason = !wasOnEight ? 'eightEarly' : res.foul ? 'eightFoul' : 'eightWrongPocket'; }
          return;
        }
        if (res.foul) return;
        if (R.open) {
          const firstPot = S.pocketed.find((p) => p.id !== 0 && p.id !== 8);
          if (firstPot) {
            const g = groupOf(firstPot.id);
            R.groups[me] = g; R.groups[opp] = g === 'solids' ? 'stripes' : 'solids'; R.open = false; res.assigned = g;
            res.continueTurn = true; msgs.push('assigned');
          }
          return;
        }
        res.continueTurn = potIds.some((n) => groupOf(n) === R.groups[me]);
      }
      function nineBall() {
        const nineDown = potIds.includes(9);
        if (wasBreak) {
          const legalBreak = !res.foul && (potIds.length > 0 || S.railBalls >= 4);
          if (!res.foul && !legalBreak) foul('illegalBreak');
        }
        if (res.foul) {
          if (nineDown) { res.respot.push(9); R.onTable.add(9); }
          if (R.fouls[me] + 1 >= 3) { res.frameOver = true; res.winner = opp; res.loss = true; res.reason = 'threeFouls'; }
          return;
        }
        if (nineDown) { res.frameOver = true; res.winner = me; res.reason = 'nineWin'; return; }
        res.continueTurn = potIds.length > 0;
      }
    },
  };
  R.startFrame(0);
  return R;
}
