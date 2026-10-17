// pool-game.js — V12 POOL: the playable 8-ball / 9-ball game on the basement table (loaded on the first tap of the
// table). Camera takes over from the walk view (and goes back exactly where you were), phone-first HUD, physics
// (js/pool-physics.js) only while the game is open, WPA rules (js/pool-rules.js), computer opponent (js/pool-ai.js).
import { THREE } from './interior-lib.js';
import { createSim, rackPositions, castBall, BALL_R as R, PHYS, mulberry } from './pool-physics.js';
import { createRules, summarizeShot, groupOf, SOLIDS, STRIPES } from './pool-rules.js';
import { chooseShot } from './pool-ai.js';
import { buildCueStick, BALL_CSS } from './pool-table.js';
import { t as i18nT, extend as i18nExtend, onLangChange, getLang } from './i18n.js';

/* ============================================================================================ strings (he / en / es) */
export const POOL_STRINGS = {
  he: {
    play: '🎱 שחק ביליארד', title: 'ביליארד', game8: '8 כדורים', game9: '9 כדורים', opponent: 'יריב', vsAI: 'נגד המחשב', twoP: '2 שחקנים',
    level: 'רמה', easy: 'קל', medium: 'בינוני', hard: 'קשה', start: 'התחל משחק', resume: 'המשך משחק', race: 'עד 3 ניצחונות',
    rulesHint: 'חוקי WPA: שבירה חוקית, שולחן פתוח, מלאים / פסים, הכרזת כיס ל-8, עבירה = כדור ביד', rulesHint9: 'חוקי 9 כדורים: פוגעים קודם בכדור הנמוך, מי שמכניס את ה-9 מנצח, 3 עבירות ברצף = הפסד',
    you: 'אתה', computer: 'מחשב', p1: 'שחקן 1', p2: 'שחקן 2',
    solids: 'מלאים', stripes: 'פסים', openTable: 'שולחן פתוח', next9: 'הבא: {0}',
    shoot: 'מכה', power: 'עוצמה', spin: 'סיבוב לבן', center: 'מרכז', follow: 'סיבוב קדימה', draw: 'סיבוב אחורה', left: 'אנגלית שמאל', right: 'אנגלית ימין', stun: 'מכה מרכזית',
    view: 'מבט', aimView: 'מבט כיוון', topView: 'מבט מלמעלה', exit: 'יציאה מהמשחק', menu: 'תפריט', rerack: 'סידור מחדש', newMatch: 'משחק חדש',
    nextFrame: 'משחקון הבא', close: 'סגור', fineL: 'כוונון עדין שמאלה', fineR: 'כוונון עדין ימינה', moveCue: 'הזזת הלבן', aimMode: 'כיוון',
    turnOf: 'התור של {0}', yourTurn: 'התור שלך — כוונו ומכה', aiThinking: 'המחשב חושב…', aiShoots: 'המחשב מכה',
    ballInHand: 'כדור ביד — גררו את הכדור הלבן למקום', ballInHandK: 'כדור ביד מאחורי קו הפתיחה — גררו את הלבן', breakMsg: 'שבירה — {0}',
    callPocket: 'בחרו כיס לכדור 8', pocketSel: 'כיס ל-8 נבחר', needCall: 'בחרו קודם כיס לכדור 8',
    f_scratch: 'עבירה: הלבן נכנס לכיס', f_noHit: 'עבירה: לא פגעת באף כדור', f_wrongFirst: 'עבירה: פגעת קודם בכדור הלא נכון', f_eightFirst: 'עבירה: אסור לפגוע קודם ב-8 כשהשולחן פתוח',
    f_noRail: 'עבירה: אף כדור לא נגע בדופן אחרי הפגיעה', f_offTable: 'עבירה: כדור עף מהשולחן', f_illegalBreak: 'עבירה: שבירה לא חוקית',
    illegalBreak: 'שבירה לא חוקית — סידור מחדש, היריב שובר', eightOnBreak: 'ה-8 נכנס בשבירה — הוחזר לנקודה', inHandFor: 'כדור ביד ל{0}', inHandYou: 'כדור ביד אצלך',
    assignedYou: 'אתה משחק ב{0}', eightWinYou: 'הכנסת את ה-8 — ניצחון במשחקון!', eightEarlyYou: 'הכנסת את ה-8 מוקדם מדי — הפסד', eightFoulYou: 'עבירה עם ה-8 — הפסד', nineWinYou: 'הכנסת את ה-9 — ניצחון!',
    frameWonYou: 'ניצחת במשחקון!', matchWonYou: 'ניצחת במשחק!',
    assigned: '{0} משחק ב{1}', potted: 'נכנס! ממשיכים', miss: 'לא נכנס — התור עובר', safeOk: 'התור עובר',
    eightWin: '{0} הכניס את ה-8 — ניצחון במשחקון!', eightEarly: '{0} הכניס את ה-8 מוקדם מדי — הפסד', eightFoul: '{0} עשה עבירה עם ה-8 — הפסד',
    eightWrongPocket: 'ה-8 נכנס לכיס הלא נכון — הפסד', nineWin: '{0} הכניס את ה-9 — ניצחון!', threeFouls: 'שלוש עבירות ברצף — הפסד', nineSpot: 'ה-9 הוחזר לנקודה',
    frameWon: '{0} ניצח במשחקון', matchWon: '{0} ניצח במשחק!', score: 'תוצאה {0}–{1}', frames: 'משחקונים',
    help: 'גררו על השולחן כדי לכוון · ◀ ▶ כוונון עדין · עוצמה בפס · מכה', helpTop: 'הקישו על השולחן כדי לכוון לנקודה',
  },
  en: {
    play: '🎱 Play pool', title: 'Pool', game8: '8-ball', game9: '9-ball', opponent: 'Opponent', vsAI: 'vs computer', twoP: '2 players',
    level: 'Level', easy: 'Easy', medium: 'Medium', hard: 'Hard', start: 'Start game', resume: 'Resume game', race: 'Race to 3',
    rulesHint: 'WPA rules: legal break, open table, solids / stripes, call the pocket for the 8, foul = ball in hand', rulesHint9: '9-ball rules: hit the lowest ball first, pot the 9 to win, 3 fouls in a row = loss',
    you: 'You', computer: 'Computer', p1: 'Player 1', p2: 'Player 2',
    solids: 'solids', stripes: 'stripes', openTable: 'Open table', next9: 'Next: {0}',
    shoot: 'Shoot', power: 'Power', spin: 'Cue-ball spin', center: 'Center', follow: 'Follow (top spin)', draw: 'Draw (back spin)', left: 'Left english', right: 'Right english', stun: 'Center ball',
    view: 'View', aimView: 'Aim view', topView: 'Top view', exit: 'Exit game', menu: 'Menu', rerack: 'Re-rack', newMatch: 'New match',
    nextFrame: 'Next frame', close: 'Close', fineL: 'Fine aim left', fineR: 'Fine aim right', moveCue: 'Move cue ball', aimMode: 'Aim',
    turnOf: "{0}'s turn", yourTurn: 'Your turn — aim and shoot', aiThinking: 'Computer is thinking…', aiShoots: 'Computer shoots',
    ballInHand: 'Ball in hand — drag the cue ball into place', ballInHandK: 'Ball in hand behind the head string — drag the cue ball', breakMsg: 'Break — {0}',
    callPocket: 'Call a pocket for the 8', pocketSel: 'Pocket for the 8 called', needCall: 'Call a pocket for the 8 first',
    f_scratch: 'Foul: scratch (cue ball pocketed)', f_noHit: 'Foul: no ball hit', f_wrongFirst: 'Foul: wrong ball hit first', f_eightFirst: 'Foul: the 8 may not be hit first on an open table',
    f_noRail: 'Foul: no ball touched a rail after contact', f_offTable: 'Foul: ball off the table', f_illegalBreak: 'Foul: illegal break',
    illegalBreak: 'Illegal break — re-rack, opponent breaks', eightOnBreak: '8 pocketed on the break — re-spotted', inHandFor: 'Ball in hand for {0}', inHandYou: 'Ball in hand for you',
    assignedYou: 'You play {0}', eightWinYou: 'You pocketed the 8 — frame won!', eightEarlyYou: 'You pocketed the 8 too early — frame lost', eightFoulYou: 'Foul on the 8 — frame lost', nineWinYou: 'You pocketed the 9 — frame won!',
    frameWonYou: 'You win the frame!', matchWonYou: 'You win the match!',
    assigned: '{0} plays {1}', potted: 'In! Keep shooting', miss: 'No ball pocketed — turn passes', safeOk: 'Turn passes',
    eightWin: '{0} pockets the 8 — frame won!', eightEarly: '{0} pocketed the 8 too early — frame lost', eightFoul: '{0} fouled on the 8 — frame lost',
    eightWrongPocket: 'The 8 went in the wrong pocket — frame lost', nineWin: '{0} pockets the 9 — frame won!', threeFouls: 'Three fouls in a row — frame lost', nineSpot: 'The 9 is re-spotted',
    frameWon: '{0} wins the frame', matchWon: '{0} wins the match!', score: 'Score {0}–{1}', frames: 'Frames',
    help: 'Drag on the table to aim · ◀ ▶ fine aim · power bar · Shoot', helpTop: 'Tap the table to aim at that spot',
  },
  es: {
    play: '🎱 Jugar al billar', title: 'Billar', game8: 'Bola 8', game9: 'Bola 9', opponent: 'Rival', vsAI: 'contra la computadora', twoP: '2 jugadores',
    level: 'Nivel', easy: 'Fácil', medium: 'Medio', hard: 'Difícil', start: 'Empezar', resume: 'Continuar partida', race: 'A 3 victorias',
    rulesHint: 'Reglas WPA: saque legal, mesa abierta, lisas / rayadas, cantar la tronera de la 8, falta = bola en mano', rulesHint9: 'Bola 9: tocar primero la bola más baja, embocar la 9 gana, 3 faltas seguidas = derrota',
    you: 'Tú', computer: 'Computadora', p1: 'Jugador 1', p2: 'Jugador 2',
    solids: 'lisas', stripes: 'rayadas', openTable: 'Mesa abierta', next9: 'Siguiente: {0}',
    shoot: 'Tirar', power: 'Fuerza', spin: 'Efecto', center: 'Centro', follow: 'Efecto de avance', draw: 'Efecto de retroceso', left: 'Efecto a la izquierda', right: 'Efecto a la derecha', stun: 'Bola al centro',
    view: 'Vista', aimView: 'Vista de tiro', topView: 'Vista superior', exit: 'Salir del juego', menu: 'Menú', rerack: 'Volver a armar', newMatch: 'Nueva partida',
    nextFrame: 'Siguiente juego', close: 'Cerrar', fineL: 'Ajuste fino a la izquierda', fineR: 'Ajuste fino a la derecha', moveCue: 'Mover la blanca', aimMode: 'Apuntar',
    turnOf: 'Turno de {0}', yourTurn: 'Tu turno — apunta y tira', aiThinking: 'La computadora está pensando…', aiShoots: 'Tira la computadora',
    ballInHand: 'Bola en mano — arrastra la bola blanca', ballInHandK: 'Bola en mano detrás de la línea de saque — arrastra la blanca', breakMsg: 'Saque — {0}',
    callPocket: 'Canta una tronera para la 8', pocketSel: 'Tronera de la 8 cantada', needCall: 'Primero canta una tronera para la 8',
    f_scratch: 'Falta: la blanca entró en la tronera', f_noHit: 'Falta: no tocaste ninguna bola', f_wrongFirst: 'Falta: tocaste primero la bola equivocada', f_eightFirst: 'Falta: con la mesa abierta no se puede tocar primero la 8',
    f_noRail: 'Falta: ninguna bola tocó una banda tras el contacto', f_offTable: 'Falta: bola fuera de la mesa', f_illegalBreak: 'Falta: saque ilegal',
    illegalBreak: 'Saque ilegal — se vuelve a armar, saca el rival', eightOnBreak: 'La 8 entró en el saque — vuelve a su punto', inHandFor: 'Bola en mano para {0}', inHandYou: 'Bola en mano para ti',
    assignedYou: 'Juegas con {0}', eightWinYou: 'Embocaste la 8 — ¡juego ganado!', eightEarlyYou: 'Embocaste la 8 antes de tiempo — juego perdido', eightFoulYou: 'Falta con la 8 — juego perdido', nineWinYou: 'Embocaste la 9 — ¡juego ganado!',
    frameWonYou: '¡Ganaste el juego!', matchWonYou: '¡Ganaste la partida!',
    assigned: '{0} juega con {1}', potted: '¡Dentro! Sigue tirando', miss: 'No entró ninguna — cambia el turno', safeOk: 'Cambia el turno',
    eightWin: '{0} emboca la 8 — ¡juego ganado!', eightEarly: '{0} embocó la 8 antes de tiempo — juego perdido', eightFoul: '{0} hizo falta con la 8 — juego perdido',
    eightWrongPocket: 'La 8 entró en otra tronera — juego perdido', nineWin: '{0} emboca la 9 — ¡juego ganado!', threeFouls: 'Tres faltas seguidas — juego perdido', nineSpot: 'La 9 vuelve a su punto',
    frameWon: '{0} gana el juego', matchWon: '¡{0} gana la partida!', score: 'Marcador {0}–{1}', frames: 'Juegos',
    help: 'Arrastra sobre la mesa para apuntar · ◀ ▶ ajuste fino · barra de fuerza · Tirar', helpTop: 'Toca la mesa para apuntar a ese punto',
  },
};
const S_ = (k, ...a) => { try { return i18nT(POOL_STRINGS.he[k] || k, ...a); } catch (_) { return POOL_STRINGS.he[k] || k; } };

const AIM_LEN = { easy: { obj: 0.9, cue: 0.5 }, medium: { obj: 0.42, cue: 0.24 }, hard: { obj: 0.16, cue: 0.08 } };
const powerToSpeed = (p) => 0.25 + (PHYS.vMax - 0.25) * Math.pow(Math.max(0, Math.min(1, p)), 1.5);
const speedToPower = (v) => Math.pow(Math.max(0, Math.min(1, (v - 0.25) / (PHYS.vMax - 0.25))), 1 / 1.5);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ============================================================================================ CSS */
const CSS = `
body.pool-on > *:not(#stage):not(#poolHud):not(#fade):not(script):not(style){visibility:hidden !important;pointer-events:none !important}
#poolHud{position:fixed;inset:0;z-index:2147480000;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font:600 14px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#f6f1e6;--g:rgba(16,20,18,.72);--b:rgba(255,255,255,.14);--acc:#e7c066}
#poolHud button{font:inherit;color:inherit;border:1px solid var(--b);background:var(--g);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:14px;cursor:pointer;touch-action:manipulation}
#poolHud button:active{transform:scale(.96)}
#poolHud .ph-top{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:calc(env(safe-area-inset-left,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);display:flex;gap:6px;align-items:flex-start;pointer-events:none}
#poolHud .ph-top>*{pointer-events:auto}
#poolHud .ph-x{width:46px;height:46px;border-radius:50%;font-size:20px;flex:none;position:relative;z-index:3}
#poolHud .ph-ico{width:46px;height:46px;border-radius:50%;font-size:18px;flex:none}
#poolHud .ph-score{flex:1;min-width:0;display:flex;gap:6px}
#poolHud .ph-pl{flex:1;min-width:0;background:var(--g);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid var(--b);border-radius:14px;padding:5px 8px;display:flex;flex-direction:column;gap:3px;transition:border-color .2s,box-shadow .2s}
#poolHud .ph-pl.on{border-color:var(--acc);box-shadow:0 0 0 2px rgba(231,192,102,.35)}
#poolHud .ph-pl .r1{display:flex;align-items:center;gap:6px;white-space:nowrap}
#poolHud .ph-pl .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:13px}
#poolHud .ph-pl .fr{font-size:20px;font-weight:800;color:var(--acc);font-variant-numeric:tabular-nums}
#poolHud .ph-pl .gp{font-size:11px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#poolHud .ph-tray{display:flex;gap:2px;flex-wrap:nowrap;direction:ltr}
#poolHud .ph-b{width:13px;height:13px;border-radius:50%;flex:none;font-size:7px;line-height:13px;text-align:center;color:#111;font-weight:800;box-shadow:inset -1px -2px 3px rgba(0,0,0,.35)}
#poolHud .ph-b.st{background-image:linear-gradient(#f6f2e6 0 26%,transparent 26% 74%,#f6f2e6 74%)}
#poolHud .ph-b.gone{opacity:.22;filter:grayscale(.6)}
#poolHud .ph-msg{position:absolute;top:calc(env(safe-area-inset-top,0px) + 74px);left:50%;transform:translateX(-50%);max-width:min(92vw,560px);text-align:center;background:rgba(10,12,11,.8);border:1px solid var(--b);border-radius:12px;padding:7px 12px;font-size:14px;pointer-events:none;transition:opacity .25s}
#poolHud .ph-msg.foul{border-color:#e0574f;color:#ffd9d6}
#poolHud .ph-msg.good{border-color:#62c38a}
#poolHud .ph-msg:empty{opacity:0}
#poolHud .ph-power{position:absolute;right:calc(env(safe-area-inset-right,0px) + 8px);top:34%;height:min(40vh,320px);width:46px;display:flex;flex-direction:column;align-items:center;gap:4px}
#poolHud .ph-track{position:relative;flex:1;width:30px;border-radius:15px;background:rgba(10,12,11,.75);border:1px solid var(--b);overflow:hidden;touch-action:none;cursor:ns-resize}
#poolHud .ph-fill{position:absolute;left:0;right:0;top:0;height:0;background:linear-gradient(#5fd17f,#f2d35c 55%,#e5533f);border-radius:15px}
#poolHud .ph-knob{position:absolute;left:-3px;right:-3px;height:6px;margin-top:-3px;background:#fff;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.6)}
#poolHud .ph-pw{font-size:11px;background:rgba(10,12,11,.75);border-radius:8px;padding:2px 5px;font-variant-numeric:tabular-nums}
#poolHud .ph-bot{position:absolute;left:calc(env(safe-area-inset-left,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);bottom:calc(env(safe-area-inset-bottom,0px) + 10px);display:flex;gap:8px;align-items:center;direction:ltr}
#poolHud .ph-bot .ph-a{width:50px;height:50px;font-size:18px;flex:none}
#poolHud .ph-shoot{flex:1;min-width:96px;max-width:240px;height:56px;margin-left:auto;font-size:18px !important;font-weight:800 !important;background:linear-gradient(#e9c46a,#c99a35) !important;color:#1d1406 !important;border-color:rgba(0,0,0,.25) !important}
#poolHud .ph-shoot[disabled]{opacity:.45}
#poolHud .ph-spin{width:56px;height:56px;border-radius:50% !important;flex:none;position:relative;background:radial-gradient(circle at 38% 34%,#fff,#e8e2d2 55%,#b9b2a2) !important}
#poolHud .ph-spin i,#poolHud .ph-spinbig i{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#d32f2f;left:50%;top:50%;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
#poolHud .ph-hand.on{border-color:var(--acc);box-shadow:0 0 0 2px rgba(231,192,102,.4)}
#poolHud .ph-spinpanel{position:absolute;left:calc(env(safe-area-inset-left,0px) + 8px);bottom:calc(env(safe-area-inset-bottom,0px) + 76px);background:var(--g);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid var(--b);border-radius:16px;padding:10px;display:none;flex-direction:column;align-items:center;gap:8px;direction:ltr}
#poolHud .ph-spinpanel.show{display:flex}
#poolHud .ph-spinbig{position:relative;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#fff,#e8e2d2 55%,#a9a292);touch-action:none;cursor:crosshair}
#poolHud .ph-spinbig::after{content:"";position:absolute;inset:25%;border-radius:50%;border:1px dashed rgba(0,0,0,.25)}
#poolHud .ph-spinlbl{font-size:12px;opacity:.9}
#poolHud .ph-pk{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50% !important;font-size:16px;display:none;padding:0}
#poolHud.call .ph-pk{display:block}
#poolHud .ph-pk.sel{background:rgba(231,192,102,.9) !important;color:#1d1406 !important;border-color:#fff !important}
#poolHud .ph-help{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 74px);left:50%;transform:translateX(-50%);font-size:12px;opacity:.85;background:rgba(10,12,11,.6);border-radius:10px;padding:4px 9px;white-space:nowrap;pointer-events:none;max-width:94vw;overflow:hidden;text-overflow:ellipsis}
#poolHud .ph-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,430px);max-height:84vh;overflow:auto;background:rgba(14,18,16,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--b);border-radius:20px;padding:16px;display:none;flex-direction:column;gap:12px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
#poolHud .ph-card.show{display:flex}
#poolHud .ph-card h2{margin:0;font-size:22px;display:flex;align-items:center;gap:8px}
#poolHud .ph-card h3{margin:0;font-size:13px;opacity:.75;font-weight:600}
#poolHud .ph-seg{display:flex;gap:6px}
#poolHud .ph-seg button{flex:1;min-height:46px;padding:6px}
#poolHud .ph-seg button.on{background:rgba(231,192,102,.92);color:#1d1406;border-color:#fff}
#poolHud .ph-go{min-height:52px;font-size:17px !important;font-weight:800 !important;background:linear-gradient(#e9c46a,#c99a35) !important;color:#1d1406 !important}
#poolHud .ph-note{font-size:12px;opacity:.7;line-height:1.4;margin:0}
#poolHud .ph-res{font-size:20px;font-weight:800;text-align:center}
#poolHud .ph-sub{font-size:14px;opacity:.85;text-align:center}
#poolHud.busy .ph-bot,#poolHud.busy .ph-power{opacity:.4;pointer-events:none}
#poolHud.menu .ph-bot,#poolHud.menu .ph-power,#poolHud.menu .ph-help,#poolHud.menu .ph-msg{display:none}
@media (orientation:landscape) and (max-height:500px){
  #poolHud .ph-power{top:24%;height:52vh}
  #poolHud .ph-msg{top:calc(env(safe-area-inset-top,0px) + 62px)}
  #poolHud .ph-help{display:none}
  #poolHud .ph-pl .gp{display:none}
}
`;

/* ============================================================================================ game */
export function createPoolGame(H) {
  try { i18nExtend(POOL_STRINGS); } catch (_) { }
  const E = H.E, ctx = E.ctx, camera = ctx.camera, T = H.T, SY = H.SY;
  const BY = SY + R; // ball centre height
  const up = new THREE.Vector3(0, 1, 0);
  const S = {
    open: false, phase: 'menu', mode: 'ai', level: 'medium', game: '8', aim: Math.PI / 2, power: 0.5, sx: 0, sy: 0,
    view: 'aim', called: null, calledManual: false, placing: false, seed: 1 + Math.floor(Math.random() * 1e6), started: false,
    msg: '', msgKind: '', camDist: 1, banner: null, lastShot: null, busyAI: false,
  };
  let sim = null, rules = null, untick = null, unlang = null, saved = null, root = null, keyH = null, keyUpH = null;
  const meshes = H.balls;
  const rnd = mulberry(S.seed);

  /* ---------------------------------------------------------------- 3D helpers (aim line, ghost, cue, shadows) */
  const G = new THREE.Group(); G.name = 'pool-game'; G.visible = false; G.userData.floor = 'basement'; H.G.add(G);
  const ribbonGeo = new THREE.PlaneGeometry(1, 1); ribbonGeo.rotateX(-Math.PI / 2); ribbonGeo.translate(0, 0, -0.5); // along −z from the origin
  const rib = (color, op, w) => {
    const m = new THREE.Mesh(ribbonGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    m.userData.w = w; m.renderOrder = 5; m.frustumCulled = false; G.add(m); return m;
  };
  const aimL = rib(0xffffff, 0.75, 0.003), objL = rib(0xffe08a, 0.85, 0.004), cueL = rib(0x9fd8ff, 0.7, 0.003), refL = rib(0xffffff, 0.45, 0.003);
  const setRib = (m, ax, ay, bx, by) => { // engine coords
    const A = H.toWorld(ax, ay), B = H.toWorld(bx, by), d = A.distanceTo(B);
    if (d < 1e-4) { m.visible = false; return; }
    m.visible = true; m.position.set(A.x, SY + 0.0012, A.z); m.scale.set(m.userData.w, 1, d);
    m.rotation.set(0, Math.atan2(-(B.x - A.x), -(B.z - A.z)), 0);
  };
  const ghost = new THREE.Group(); G.add(ghost);
  ghost.add(new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.93, R * 1.02, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -R + 0.0013; ghost.add(ring);
  const cue = new THREE.Group(); cue.name = 'pool-cue-stick'; G.add(cue);
  cue.add(buildCueStick(E));
  // contact shadows (one instanced draw)
  const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const shGeo = new THREE.PlaneGeometry(R * 2.6, R * 2.6); shGeo.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, toneMapped: false }), 16);
  shadows.renderOrder = 2; shadows.frustumCulled = false; shadows.name = 'pool-ball-shadows'; H.G.add(shadows);
  const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
  function syncShadows() {
    let n = 0;
    for (let id = 0; id < 16; id++) { const m = meshes[id]; if (!m.visible) continue; _m4.makeTranslation(m.position.x + 0.004, SY + 0.0008, m.position.z + 0.004); shadows.setMatrixAt(n++, _m4); }
    shadows.count = n; shadows.instanceMatrix.needsUpdate = true;
  }
  syncShadows();

  /* ---------------------------------------------------------------- state ⇄ meshes */
  const drops = []; // pocket animations
  function syncBalls(dt, animDt = dt) {
    for (const b of sim.balls) {
      const m = meshes[b.id]; if (!m) continue;
      if (b.on) {
        m.visible = true; m.scale.setScalar(1); H.toWorld(b.x, b.y, m.position);
        const w = Math.hypot(b.wx, b.wy, b.wz);
        if (w > 1e-3 && dt > 0) { _v.set(b.wx, b.wz, -b.wy).divideScalar(w); _q.setFromAxisAngle(_v, w * dt); m.quaternion.premultiply(_q); }
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += animDt; const k = Math.min(1, d.t / 0.32), m = meshes[d.id];
      const e = k * k;
      m.position.set(d.from.x + (d.to.x - d.from.x) * Math.min(1, k * 1.4), BY - e * 0.075, d.from.z + (d.to.z - d.from.z) * Math.min(1, k * 1.4));
      m.scale.setScalar(1 - 0.15 * e);
      if (k >= 1) { m.visible = false; drops.splice(i, 1); }
    }
    syncShadows();
  }
  function hideOffBalls() { for (const b of sim.balls) if (!b.on && !drops.some((d) => d.id === b.id)) meshes[b.id].visible = false; for (let id = 0; id < 16; id++) if (!sim.ball(id)) meshes[id].visible = false; }

  /* ---------------------------------------------------------------- match / frame */
  const names = () => (S.mode === 'ai' ? [S_('you'), S_('computer')] : [S_('p1'), S_('p2')]);
  const isAI = (p = rules.turn) => S.mode === 'ai' && p === 1;
  function rackFrame() {
    sim = createSim(T);
    S.seed = (S.seed * 1103515245 + 12345) >>> 0;
    for (const p of rackPositions(T, S.game, S.seed)) sim.addBall(p.id, p.x, p.y);
    sim.addBall(0, (rnd() - 0.5) * 0.04, T.headY - 0.03);
    for (const m of meshes) { m.quaternion.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)); }
    drops.length = 0; hideOffBalls(); syncBalls(0);
    S.aim = Math.PI / 2; S.sx = S.sy = 0; S.power = rules.isBreak ? 0.95 : 0.5; S.called = null; S.calledManual = false;
    S.placing = false;
  }
  function newMatch() {
    rules = createRules(S.game, { raceTo: 3, names: names() });
    rules.startFrame(0);
    rackFrame(); S.started = true; S.banner = null;
    beginTurn(true);
  }
  function nextFrame() { rules.startFrame(rules.breaker); rackFrame(); S.banner = null; beginTurn(true); }
  function rerack() {
    if (!rules) { H.rackStatic('8', 1 + Math.floor(Math.random() * 1000)); return; }
    rules.startFrame(rules.breaker); rackFrame(); S.banner = null; if (S.open) beginTurn(true); else S.phase = 'menu';
  }

  /* ---------------------------------------------------------------- turn flow */
  function beginTurn(first) {
    S.called = null; S.calledManual = false;
    const nm = names()[rules.turn];
    if (rules.ballInHand && !sim.ball(0).on) placeDefaultCue();
    if (rules.isBreak) { S.power = 0.95; S.sy = -0.1; S.sx = 0; aimAtRack(); }
    if (isAI()) { S.phase = 'ai'; S.placing = false; if (first || rules.isBreak) setMsg(S_('breakMsg', nm)); aiTurn(); }
    else {
      S.phase = 'aim'; S.placing = false;
      if (rules.isBreak) setMsg(S_('breakMsg', nm) + ' · ' + S_('ballInHandK'));
      else if (rules.ballInHand) setMsg((S.mode === '2p' ? S_('turnOf', nm) + ' · ' : '') + S_('ballInHand'), 'foul', true);
      else if (rules.needsCall()) setMsg((S.mode === '2p' ? S_('turnOf', nm) + ' · ' : '') + S_('callPocket'));
      else if (!first) setMsg(S.mode === '2p' ? S_('turnOf', nm) : S_('yourTurn'), '', true);
      if (!rules.ballInHand) S.placing = false;
    }
    updateHud();
  }
  function aimAtRack() {
    const c = sim.ball(0); const apex = sim.balls.filter((b) => b.on && b.id).sort((a, b) => a.y - b.y)[0];
    if (c && apex) S.aim = Math.atan2(apex.y - c.y, apex.x - c.x);
  }
  function freeSpot(x, y, kitchen) {
    const ok = (px, py) => Math.abs(px) <= T.W / 2 - R && Math.abs(py) <= T.L / 2 - R && (!kitchen || py <= T.headY) && sim.balls.every((b) => !b.on || b.id === 0 || Math.hypot(b.x - px, b.y - py) > 2 * R + 0.001);
    if (ok(x, y)) return [x, y];
    for (let r = 0.02; r < 1.2; r += 0.02) for (let a = 0; a < 6.28; a += 0.3) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return [px, py]; }
    return [x, y];
  }
  function placeDefaultCue() {
    const [x, y] = freeSpot(0, T.headY - 0.02, rules.ballInHand === 'kitchen');
    sim.place(0, x, y); meshes[0].visible = true; syncBalls(0);
  }
  function respot(id) {
    let [x, y] = T.footSpot;
    for (let k = 0; k < 40; k++) { if (sim.balls.every((b) => !b.on || b.id === id || Math.hypot(b.x - x, b.y - y) > 2 * R + 0.0005)) break; y += 2 * R * 0.5; if (y > T.L / 2 - R) { y = T.footSpot[1]; x += 2 * R; } }
    sim.place(id, x, y); meshes[id].visible = true; meshes[id].scale.setScalar(1);
  }

  /* ---------------------------------------------------------------- shooting */
  let stroke = null, acc = 0, evIdx = 0, lastClack = 0, shotT0 = 0, camWatch = null;
  function canShoot() { return S.open && S.phase === 'aim' && !isAI() && sim && sim.ball(0).on && !stroke; }
  function humanShoot() {
    if (!canShoot()) return false;
    if (S.power < 0.015) return false;
    if (rules.needsCall() && S.called == null) { setMsg(S_('needCall'), 'foul'); return false; }
    fire(S.aim, powerToSpeed(S.power), S.sx, S.sy);
    return true;
  }
  function fire(ang, speed, sx, sy) {
    S.phase = 'shooting'; S.placing = false;
    S.lastShot = { ang, speed, sx, sy, called: S.called };
    const pull0 = 0.02 + S.power * 0.22;
    const c0 = sim.ball(0);
    stroke = { t: 0, ang, speed, sx, sy, pull0, back: Math.min(0.32, pull0 + 0.06), at: { x: c0.x, y: c0.y } };
    setMsg(''); updateHud();
  }
  function launch() {
    const st = stroke;
    sim.events.length = 0; evIdx = 0; acc = 0; shotT0 = sim.t;
    sim.strike(0, st.ang, st.speed, st.sx, st.sy);
    const c = sim.ball(0); const wp = H.toWorld(c.x, c.y);
    E.snd.clack(wp, Math.min(1, 0.35 + st.speed / 7)); E.snd.thud(wp, 0.15 + st.speed / 30);
    camWatch = { x: c.x, y: c.y, ang: st.ang };
    S.phase = 'moving';
  }
  function processEvents() {
    const ev = sim.events, now = performance.now();
    for (; evIdx < ev.length; evIdx++) {
      const e = ev[evIdx];
      if (e.type === 'ball') { if (now - lastClack > 18 && e.v > 0.05) { lastClack = now; const b = sim.ball(e.a); E.snd.clack(H.toWorld(b.x, b.y), Math.min(1, 0.08 + e.v / 3.2)); } }
      else if (e.type === 'cush') { if (e.v > 0.15) { const b = sim.ball(e.a); E.snd.thud(H.toWorld(b.x, b.y), Math.min(0.45, 0.05 + e.v / 7)); } }
      else if (e.type === 'pocket') {
        const k = T.pockets[e.p], from = H.toWorld(e.x, e.y), to = H.toWorld(k.x, k.y);
        drops.push({ id: e.a, t: 0, from, to });
        E.snd.tone(to, { freq: 210, freqEnd: 70, dur: 0.22, vol: 0.28 }); E.snd.burst(to, { dur: 0.14, type: 'lowpass', freq: 520, vol: 0.24 });
        setTimeout(() => { try { E.snd.thud(to, 0.25); } catch (_) {} }, 160);
        updateHud();
      }
    }
  }
  function resolveShot() {
    const sum = summarizeShot(sim.events, { called: S.lastShot ? S.lastShot.called : null });
    const shooter = rules.turn, nm = names()[shooter], oppNm = names()[1 - shooter];
    const res = rules.shot(sum);
    for (const id of res.respot) respot(id);
    let msg = '', kind = '';
    if (res.frameOver) {
      const W = names()[res.winner];
      const key = res.reason === 'eightWin' ? 'eightWin' : res.reason === 'nineWin' ? 'nineWin' : res.reason;
      const you = S.mode === 'ai' && shooter === 0 && POOL_STRINGS.he[key + 'You'];
      msg = you ? S_(key + 'You') : key === 'eightWrongPocket' || key === 'threeFouls' ? S_(key) : S_(key, nm);
      kind = res.winner === shooter ? 'good' : 'foul';
      S.phase = 'over';
      S.banner = { msg, win: W, score: rules.score.slice(), match: rules.matchOver };
      setMsg(msg, kind, true); updateHud(); showBanner();
      if (!sim.ball(0).on) { placeDefaultCue(); }
      return res;
    }
    if (res.rerack) {
      setMsg(S_('illegalBreak'), 'foul', true);
      rules.startFrame(rules.breaker); rackFrame(); beginTurn(false); setMsg(S_('illegalBreak'), 'foul', true); return res;
    }
    const parts = [];
    if (res.foul) { parts.push(S_('f_' + res.fouls[0])); kind = 'foul'; }
    if (res.msgs.includes('eightOnBreak')) parts.push(S_('eightOnBreak'));
    if (res.respot.includes(9)) parts.push(S_('nineSpot'));
    if (res.assigned) parts.push(S.mode === 'ai' && shooter === 0 ? S_('assignedYou', S_(res.assigned)) : S_('assigned', nm, S_(res.assigned)));
    if (!res.foul) {
      if (res.continueTurn) { parts.push(S_('potted')); kind = 'good'; }
      else parts.push(sum.pocketed.length ? S_('safeOk') : S_('miss'));
    } else parts.push(S.mode === 'ai' && shooter === 1 ? S_('inHandYou') : S_('inHandFor', oppNm));
    msg = parts.join(' · ');
    if (!sim.ball(0).on) placeDefaultCue();
    beginTurn(false);
    setMsg(msg + (rules.ballInHand && !isAI() ? ' · ' + S_(rules.ballInHand === 'kitchen' ? 'ballInHandK' : 'ballInHand') : '') + (rules.needsCall() && !isAI() ? ' · ' + S_('callPocket') : ''), kind, true);
    return res;
  }

  /* ---------------------------------------------------------------- AI */
  async function aiTurn() {
    if (S.busyAI) return; S.busyAI = true;
    const myFrame = rules.frame;
    try {
      setMsg(S_('aiThinking')); updateHud();
      const t0 = performance.now();
      const L = { easy: 0.7, medium: 0.9, hard: 1.0 }[S.level] * 1000;
      const d = await chooseShot(sim, rules, S.level, { rng: rnd, yieldFn: () => new Promise((r) => setTimeout(r, 0)) });
      while (performance.now() - t0 < L) await new Promise((r) => setTimeout(r, 50));
      if (!S.open || S.phase !== 'ai' || rules.frame !== myFrame) return;
      if (d.place) { await animateCueTo(d.place.x, d.place.y); }
      S.called = d.called; S.sx = d.sx; S.sy = d.sy;
      const a0 = S.aim, da = wrapA(d.ang - a0), p0 = S.power, p1 = speedToPower(d.speed);
      await tween(0.75, (k) => { const e = k * k * (3 - 2 * k); S.aim = a0 + da * e; S.power = p0 + (p1 - p0) * e; });
      S.aim = d.ang; S.power = p1;
      await new Promise((r) => setTimeout(r, 350));
      if (!S.open || S.phase !== 'ai') return;
      setMsg(S_('aiShoots'));
      S.phase = 'aim'; // fire() expects to come from the aiming phase
      fire(d.ang, d.speed, d.sx, d.sy);
    } finally { S.busyAI = false; }
  }
  const tweens = [];
  function tween(dur, fn) { return new Promise((res) => tweens.push({ t: 0, dur, fn, res })); }
  async function animateCueTo(x, y) {
    const c = sim.ball(0); const x0 = c.on ? c.x : x, y0 = c.on ? c.y : y;
    sim.place(0, x0, y0);
    await tween(0.5, (k) => { const e = k * k * (3 - 2 * k); const b = sim.ball(0); b.x = x0 + (x - x0) * e; b.y = y0 + (y - y0) * e; });
    sim.place(0, x, y);
  }

  /* ---------------------------------------------------------------- aim preview */
  let preview = null;
  function updateAim() {
    const showing = S.open && sim && (S.phase === 'aim' || S.phase === 'ai' || S.phase === 'shooting') && sim.ball(0).on;
    for (const m of [aimL, objL, cueL, refL]) m.visible = false;
    ghost.visible = false;
    if (!showing) { preview = null; return; }
    const c = sim.ball(0), dx = Math.cos(S.aim), dy = Math.sin(S.aim);
    const hit = castBall(T, sim.balls, c.x, c.y, dx, dy, 0, 3);
    preview = hit;
    const lv = S.mode === 'ai' ? S.level : 'medium', LEN = AIM_LEN[lv];
    if (S.phase === 'shooting' && stroke && stroke.t > 0.25) return;
    setRib(aimL, c.x, c.y, hit.x, hit.y);
    ghost.visible = hit.type !== 'none'; H.toWorld(hit.x, hit.y, ghost.position);
    if (hit.type === 'ball') {
      const o = sim.ball(hit.id); const ox = -hit.nx, oy = -hit.ny; // object ball travels along the line of centres
      setRib(objL, o.x, o.y, o.x + ox * LEN.obj, o.y + oy * LEN.obj);
      // cue ball: tangent line (stun); follow / draw bends it forward / back
      let tx = dx - (dx * ox + dy * oy) * ox, ty = dy - (dx * ox + dy * oy) * oy; const tl = Math.hypot(tx, ty);
      if (tl > 0.02) { tx /= tl; ty /= tl; const f = S.sy * 0.6; let ux = tx + ox * f, uy = ty + oy * f; const ul = Math.hypot(ux, uy) || 1; setRib(cueL, hit.x, hit.y, hit.x + ux / ul * LEN.cue, hit.y + uy / ul * LEN.cue); }
      else if (S.sy) setRib(cueL, hit.x, hit.y, hit.x + ox * S.sy * LEN.cue, hit.y + oy * S.sy * LEN.cue);
      objL.material.color.setHex(legalTarget(hit.id) ? 0xffe08a : 0xff6a5c);
      // auto-select the pocket for the 8
      if (rules && rules.needsCall() && hit.id === 8 && !S.calledManual && !isAI()) {
        let bestK = null, bc = -2;
        for (const k of T.pockets) { const vx = k.aimX - o.x, vy = k.aimY - o.y, l = Math.hypot(vx, vy); const cs = (vx * ox + vy * oy) / l; if (cs > bc) { bc = cs; bestK = k.id; } }
        if (bc > 0.9) S.called = bestK;
      }
    } else if (hit.type === 'cush') {
      const vn = dx * hit.nx + dy * hit.ny; const rx = dx - 2 * vn * hit.nx, ry = dy - 2 * vn * hit.ny;
      setRib(refL, hit.x, hit.y, hit.x + rx * LEN.cue * 1.5, hit.y + ry * LEN.cue * 1.5);
    }
  }
  const legalTarget = (id) => { try { return rules.legalFirst().includes(id); } catch (_) { return true; } };
  const _right = new THREE.Vector3(), _dir = new THREE.Vector3(), _but = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  function updateCue(dt) {
    const show = S.open && sim && ((sim.ball(0).on && (S.phase === 'aim' || S.phase === 'ai' || S.phase === 'shooting') && !S.placingDrag) || (stroke && stroke.fired));
    cue.visible = !!show; if (!show) return;
    let c = sim.ball(0), ang = S.aim, pull = 0.012 + S.power * 0.22;
    if (stroke) c = stroke.at;
    if (stroke) {
      stroke.t += dt; const t = stroke.t;
      ang = stroke.ang;
      if (t < 0.3) { const k = t / 0.3; pull = stroke.pull0 + (stroke.back - stroke.pull0) * (k * k * (3 - 2 * k)); }
      else { const k = Math.min(1, (t - 0.3) / Math.max(0.05, 0.13 - stroke.speed * 0.008)); pull = stroke.back * (1 - k * k) - 0.004 * k; if (k >= 1 && !stroke.fired) { stroke.fired = true; launch(); } }
      if (stroke.fired && t > 0.75) stroke = null;
    }
    _dir.set(Math.cos(ang), 0, -Math.sin(ang)); // aim direction in world
    _right.crossVectors(_dir, up).normalize();
    const el = 0.085; _but.copy(_dir).multiplyScalar(-Math.cos(el)).addScaledVector(up, Math.sin(el));
    H.toWorld(c.x, c.y, _v);
    const ox = S.sx * 0.5 * R, oy = S.sy * 0.5 * R, back = Math.sqrt(Math.max(0, R * R - ox * ox - oy * oy));
    _v.addScaledVector(_right, ox).addScaledVector(up, oy).addScaledVector(_dir, -back);
    cue.position.copy(_v).addScaledVector(_but, Math.max(0, pull));
    cue.quaternion.setFromUnitVectors(_z, _but);
  }

  /* ---------------------------------------------------------------- camera */
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 60, rate: 3 };
  const goal = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 60 };
  const ceilY = () => { try { return E.plan.basementCeil - 0.06; } catch (_) { return SY + 1.25; } };
  function computeGoal() {
    const asp = Math.max(0.3, innerWidth / Math.max(1, innerHeight)), portrait = asp < 1;
    const c = sim && sim.ball(0) && sim.ball(0).on ? sim.ball(0) : { x: 0, y: T.headY };
    const topView = S.view === 'top';
    if (topView) {
      const [OX, OY] = H.tableTop.outer;
      const longV = portrait; // long axis along the screen's long side
      const halfV = (longV ? OY : OX) * 1.06 + 0.1, halfH = (longV ? OX : OY) * 1.06;
      let fov = 62; const tv = () => Math.tan(fov * Math.PI / 360);
      let h = Math.max(halfV / tv(), halfH / (tv() * asp));
      const maxH = ceilY() - SY;
      if (h > maxH) { h = maxH; const need = Math.max(halfV / h, halfH / (h * asp)); fov = Math.min(100, 2 * Math.atan(need) * 180 / Math.PI); }
      goal.pos.set(H.CX, SY + h, H.CZ + (longV ? 0.06 : 0)); goal.look.set(H.CX, SY, H.CZ + (longV ? 0.06 : 0) - 0.0001);
      if (longV) goal.up.set(0, 0, -1); else goal.up.set(1, 0, 0);
      goal.fov = fov;
      return;
    }
    goal.up.set(0, 1, 0);
    if (S.phase === 'moving' && camWatch) { // broadcast view while the balls roll: higher and further back
      const dx = Math.cos(camWatch.ang), dy = Math.sin(camWatch.ang);
      const w = H.toWorld(camWatch.x, camWatch.y);
      const dist = (portrait ? 1.35 : 1.15) * S.camDist;
      goal.pos.set(w.x - dx * dist, Math.min(ceilY() - 0.05, BY + (portrait ? 1.0 : 0.85)), w.z + dy * dist);
      const lk = H.toWorld(Math.max(-0.4, Math.min(0.4, camWatch.x + dx * 0.7)), Math.max(-0.9, Math.min(0.9, camWatch.y + dy * 0.7)));
      goal.look.copy(lk); goal.look.y = SY;
      goal.fov = portrait ? 70 : 55; return;
    }
    const dx = Math.cos(S.aim), dy = Math.sin(S.aim), w = H.toWorld(c.x, c.y);
    // behind and above the cue ball, looking down the shot line so the far rail stays in the frame
    const dist = (portrait ? 0.82 : 0.78) * S.camDist, hgt = (portrait ? 0.62 : 0.5) * Math.max(0.7, S.camDist), ahead = portrait ? 0.95 : 0.9;
    goal.pos.set(w.x - dx * dist, Math.min(ceilY() - 0.05, BY + hgt), w.z + dy * dist);
    goal.look.set(w.x + dx * ahead, SY - 0.05, w.z - dy * ahead);
    goal.fov = portrait ? 66 : 52;
  }
  function updateCamera(dt) {
    computeGoal();
    const k = 1 - Math.exp(-dt * cam.rate);
    cam.pos.lerp(goal.pos, k); cam.look.lerp(goal.look, k); cam.up.lerp(goal.up, k).normalize(); cam.fov += (goal.fov - cam.fov) * k;
    cam.rate = Math.min(6, cam.rate + dt * 2);
    applyCam();
  }
  function applyCam() {
    camera.position.copy(cam.pos); camera.up.copy(cam.up); camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 1e-3) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  }
  // hide the billiard pendant when looking straight down (it hangs between the camera and the table)
  function updatePendant() {
    if (!H.pendant) return; const vis = !(S.open && S.view === 'top' && cam.pos.y > SY + 0.75);
    for (const c of H.pendant.children) if (!c.isLight && c.visible !== vis) c.visible = vis; // the lamp's light stays on
  }

  /* ---------------------------------------------------------------- HUD */
  let el = {};
  function setMsg(m, kind = '', sticky = false) { S.msg = m || ''; S.msgKind = kind; S.msgT = sticky ? 6 : 3.2; if (el.msg) { el.msg.textContent = S.msg; el.msg.className = 'ph-msg' + (kind ? ' ' + kind : ''); } }
  function buildHud() {
    if (!document.getElementById('poolCss')) { const st = document.createElement('style'); st.id = 'poolCss'; st.textContent = CSS; document.head.appendChild(st); }
    root = document.createElement('div'); root.id = 'poolHud'; root.setAttribute('data-i18n-skip', ''); root.className = 'menu';
    root.innerHTML = `
      <div class="ph-top">
        <button class="ph-x" data-a="exit">✕</button>
        <div class="ph-score"><div class="ph-pl" data-p="0"></div><div class="ph-pl" data-p="1"></div></div>
        <button class="ph-ico" data-a="view">🎥</button>
        <button class="ph-ico" data-a="menu">☰</button>
      </div>
      <div class="ph-msg"></div>
      <div class="ph-help"></div>
      <div class="ph-power"><div class="ph-pw"></div><div class="ph-track"><div class="ph-fill"></div><div class="ph-knob"></div></div></div>
      <div class="ph-spinpanel"><div class="ph-spinlbl"></div><div class="ph-spinbig"><i></i></div><button data-a="spin0" style="min-height:40px;padding:4px 14px"></button></div>
      <div class="ph-bot">
        <button class="ph-spin" data-a="spin"><i></i></button>
        <button class="ph-a" data-a="left">◀</button>
        <button class="ph-a" data-a="right">▶</button>
        <button class="ph-a ph-hand" data-a="hand">✋</button>
        <button class="ph-shoot" data-a="shoot"></button>
      </div>
      <div class="ph-card ph-menu"></div>
      <div class="ph-card ph-banner"></div>
      ${T.pockets.map((k) => `<button class="ph-pk" data-pk="${k.id}">🎯</button>`).join('')}`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    el = { top: q('.ph-top'), msg: q('.ph-msg'), help: q('.ph-help'), pw: q('.ph-pw'), track: q('.ph-track'), fill: q('.ph-fill'), knob: q('.ph-knob'),
      spinBtn: q('.ph-spin'), spinDot: q('.ph-spin i'), spinPanel: q('.ph-spinpanel'), spinBig: q('.ph-spinbig'), spinBigDot: q('.ph-spinbig i'), spinLbl: q('.ph-spinlbl'),
      shoot: q('.ph-shoot'), hand: q('.ph-hand'), menu: q('.ph-menu'), banner: q('.ph-banner'), pls: [q('.ph-pl[data-p="0"]'), q('.ph-pl[data-p="1"]')],
      pks: [...root.querySelectorAll('.ph-pk')], view: q('[data-a="view"]'), menuBtn: q('[data-a="menu"]'), exit: q('[data-a="exit"]'), left: q('[data-a="left"]'), right: q('[data-a="right"]'), spin0: q('[data-a="spin0"]') };
    // buttons
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      e.stopPropagation();
      const a = b.dataset.a;
      if (b.dataset.pk != null) { S.called = +b.dataset.pk; S.calledManual = true; E.snd.click(cam.look, 0.5); setMsg(S_('pocketSel'), 'good'); updateHud(); return; }
      if (a === 'exit') close();
      else if (a === 'view') { S.view = S.view === 'aim' ? 'top' : 'aim'; cam.rate = 3; updateHud(); }
      else if (a === 'menu') showMenu(true);
      else if (a === 'shoot') humanShoot();
      else if (a === 'spin') el.spinPanel.classList.toggle('show');
      else if (a === 'spin0') { S.sx = S.sy = 0; updateHud(); }
      else if (a === 'hand') { S.placing = !S.placing && !!rules && !!rules.ballInHand; updateHud(); }
      else if (b.dataset.m) { menuSel[b.dataset.m] = b.dataset.v; renderMenu(); }
      else if (a === 'start') { S.mode = menuSel.mode; S.level = menuSel.level; S.game = menuSel.game; showMenu(false); newMatch(); }
      else if (a === 'resume') resume();
      else if (a === 'next') { hideBanner(); if (rules.matchOver) newMatch(); else nextFrame(); }
      else if (a === 'rerack') { showMenu(false); rerack(); }
      else if (a === 'bclose') { hideBanner(); close(); }
    });
    // fine aim (hold = repeat, accelerating)
    for (const [b, s] of [[el.left, 1], [el.right, -1]]) {
      let iv = null, n = 0;
      const stop = () => { if (iv) clearInterval(iv); iv = null; };
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!canAim()) return; n = 0; S.aim += s * 0.0009; iv = setInterval(() => { n++; S.aim += s * Math.min(0.012, 0.0009 * (1 + n * 0.25)); }, 60); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
      b.addEventListener('click', (e) => e.stopPropagation());
    }
    // power slider
    const setPw = (e) => { const r = el.track.getBoundingClientRect(); S.power = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); updatePower(); };
    el.track.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!canAim()) return; el.track.setPointerCapture(e.pointerId); setPw(e); el.track._d = true; });
    el.track.addEventListener('pointermove', (e) => { if (el.track._d) setPw(e); });
    for (const ev of ['pointerup', 'pointercancel']) el.track.addEventListener(ev, () => { el.track._d = false; });
    // spin pad
    const setSpin = (e) => { const r = el.spinBig.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = -((e.clientY - r.top) / r.height - 0.5) * 2; const l = Math.hypot(x, y) / 0.5; if (l > 1) { x /= l; y /= l; } S.sx = x / 0.5; S.sy = y / 0.5; updateHud(); };
    el.spinBig.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.spinBig.setPointerCapture(e.pointerId); el.spinBig._d = true; setSpin(e); });
    el.spinBig.addEventListener('pointermove', (e) => { if (el.spinBig._d) setSpin(e); });
    for (const ev of ['pointerup', 'pointercancel']) el.spinBig.addEventListener(ev, () => { el.spinBig._d = false; });
    for (const x of [el.spinPanel, el.menu, el.banner]) x.addEventListener('pointerdown', (e) => e.stopPropagation());
    // table drags (the HUD background is the touch layer)
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
    root.addEventListener('wheel', (e) => { e.preventDefault(); S.camDist = Math.max(0.55, Math.min(1.8, S.camDist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    renderTexts();
  }
  const canAim = () => S.open && S.phase === 'aim' && !isAI() && !stroke;
  let drag = null;
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
  function feltPoint(e) {
    _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    camera.updateMatrixWorld(true); _ray.setFromCamera(_ndc, camera); _plane.constant = -BY;
    if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
    return { x: _hit.x - H.CX, y: H.CZ - _hit.z };
  }
  function onDown(e) {
    if (e.target !== root || !canAim()) return;
    el.spinPanel.classList.remove('show');
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
    const p = feltPoint(e), c = sim.ball(0);
    // ball in hand: a drag that starts on the cue ball (or anywhere while ✋ is on) moves it, other drags aim
    const nearCue = p && c.on && (Math.hypot(p.x - c.x, p.y - c.y) < 0.075 || screenDist(e, c) < 48);
    if (rules.ballInHand && (S.placing || nearCue)) {
      drag = { kind: 'place' }; S.placingDrag = true;
      if (p && !nearCue) placeCueAt(p.x, p.y);
      return;
    }
    if (S.view === 'top' && p) { drag = { kind: 'point' }; S.aim = Math.atan2(p.y - c.y, p.x - c.x); return; }
    drag = { kind: 'rot', x0: e.clientX, a0: S.aim, y0: e.clientY };
  }
  function screenDist(e, b) { const w = H.toWorld(b.x, b.y).project(camera); return Math.hypot((w.x + 1) / 2 * innerWidth - e.clientX, (1 - w.y) / 2 * innerHeight - e.clientY); }
  function onMove(e) {
    if (!drag || !canAim()) return;
    if (drag.kind === 'place') { const p = feltPoint(e); if (p) placeCueAt(p.x, p.y); return; }
    if (drag.kind === 'point') { const p = feltPoint(e), c = sim.ball(0); if (p && Math.hypot(p.x - c.x, p.y - c.y) > 0.01) S.aim = Math.atan2(p.y - c.y, p.x - c.x); return; }
    const k = (e.pointerType === 'mouse' ? 0.0035 : 0.0045) * (Math.abs(e.clientY - drag.y0) > 140 ? 0.35 : 1); // drag further up / down = finer
    S.aim = drag.a0 - (e.clientX - drag.x0) * k;
  }
  function onUp() { if (drag && drag.kind === 'place') { S.placingDrag = false; } drag = null; }
  function placeCueAt(x, y) {
    const kitchen = rules.ballInHand === 'kitchen';
    x = Math.max(-T.W / 2 + R, Math.min(T.W / 2 - R, x));
    y = Math.max(-T.L / 2 + R, Math.min(kitchen ? T.headY : T.L / 2 - R, y));
    // stay clear of the other balls: slide out along the contact normal
    for (let it = 0; it < 4; it++) for (const b of sim.balls) {
      if (!b.on || b.id === 0) continue; const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
      if (d < 2 * R + 0.0005) { const k = (2 * R + 0.0006) / (d || 1e-6); x = b.x + (d ? dx : 1) * k; y = b.y + (d ? dy : 0) * k; }
    }
    if (Math.abs(x) > T.W / 2 - R || Math.abs(y) > T.L / 2 - R || (kitchen && y > T.headY)) return;
    if (sim.balls.some((b) => b.on && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < 2 * R)) return;
    sim.place(0, x, y);
  }
  function updatePower() {
    if (!el.fill) return;
    el.fill.style.height = (S.power * 100).toFixed(1) + '%'; el.knob.style.top = (S.power * 100).toFixed(1) + '%';
    el.pw.textContent = Math.round(S.power * 100) + '%';
  }
  function trayHtml(ids, goneSet) {
    return '<div class="ph-tray">' + ids.map((n) => `<span class="ph-b${n >= 9 ? ' st' : ''}${goneSet.has(n) ? ' gone' : ''}" style="background-color:${BALL_CSS(n)};${n === 8 ? 'color:#fff' : ''}">${n}</span>`).join('') + '</div>';
  }
  function updateHud() {
    if (!root) return;
    root.classList.toggle('menu', S.phase === 'menu');
    root.classList.toggle('busy', S.phase !== 'aim' || isAIturn());
    const nm = names();
    if (rules) {
      const on = rules.onTable;
      const gone = new Set(); for (let n = 1; n <= 15; n++) if (!on.has(n)) gone.add(n);
      for (let p = 0; p < 2; p++) {
        const g = rules.groups[p];
        let gp, tray = '';
        if (rules.game === '9') { gp = p === rules.turn && rules.lowest() ? S_('next9', rules.lowest()) : ''; tray = p === 0 ? trayHtml([1, 2, 3, 4, 5, 6, 7, 8, 9], gone) : ''; }
        else if (g) { gp = S_(g); const ids = (g === 'solids' ? SOLIDS : STRIPES).concat(rules.groupBalls(p).length ? [] : [8]); tray = trayHtml(ids, gone); }
        else { gp = S_('openTable'); }
        el.pls[p].classList.toggle('on', rules.turn === p && S.phase !== 'over');
        el.pls[p].innerHTML = `<div class="r1"><span class="nm">${rules.turn === p && S.phase !== 'over' ? '▶ ' : ''}${esc(nm[p])}</span><span class="fr">${rules.score[p]}</span></div><div class="gp">${esc(gp)}</div>${tray}`;
      }
    } else for (let p = 0; p < 2; p++) el.pls[p].innerHTML = `<div class="r1"><span class="nm">${esc(nm[p])}</span><span class="fr">0</span></div>`;
    el.shoot.disabled = !canShoot();
    el.hand.style.display = rules && rules.ballInHand && !isAI() && S.phase === 'aim' ? '' : 'none';
    el.hand.classList.toggle('on', !!S.placing);
    el.hand.textContent = S.placing ? '✋' : '🎯';
    el.hand.title = S.placing ? S_('moveCue') : S_('aimMode');
    el.view.textContent = S.view === 'aim' ? '🎥' : '⬇';
    el.view.title = S.view === 'aim' ? S_('topView') : S_('aimView');
    const dot = (d, s) => { d.style.left = (50 + S.sx * 0.5 * 50 * s) + '%'; d.style.top = (50 - S.sy * 0.5 * 50 * s) + '%'; };
    dot(el.spinDot, 1); dot(el.spinBigDot, 1);
    const sl = Math.abs(S.sy) < 0.15 && Math.abs(S.sx) < 0.15 ? 'stun' : Math.abs(S.sy) >= Math.abs(S.sx) ? (S.sy > 0 ? 'follow' : 'draw') : (S.sx > 0 ? 'right' : 'left');
    el.spinLbl.textContent = S_('spin') + ' · ' + S_(sl);
    root.classList.toggle('call', !!(rules && rules.needsCall() && S.phase === 'aim' && !isAI()) || (isAIturn() && S.called != null && S.phase !== 'moving'));
    el.pks.forEach((b) => b.classList.toggle('sel', +b.dataset.pk === S.called));
    el.help.textContent = S.view === 'top' ? S_('helpTop') : S_('help');
    el.help.style.display = S.phase === 'aim' && !isAI() && !rules.ballInHand ? '' : 'none';
    updatePower();
  }
  const isAIturn = () => !!(rules && isAI());
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderTexts() {
    if (!root) return;
    root.dir = getLang() === 'he' ? 'rtl' : 'ltr';
    el.exit.title = el.exit.ariaLabel = S_('exit'); el.menuBtn.title = S_('menu'); el.left.title = S_('fineL'); el.right.title = S_('fineR');
    el.spinBtn.title = S_('spin'); el.spin0.textContent = S_('center'); el.shoot.textContent = S_('shoot'); el.track.title = S_('power');
    el.exit.setAttribute('aria-label', S_('exit'));
    el.pks.forEach((b) => { b.title = S_('callPocket'); });
    if (el.menu.classList.contains('show')) renderMenu();
    if (S.banner) renderBanner();
    if (rules) { rules.names = names(); }
    updateHud();
  }
  const menuSel = { mode: 'ai', level: 'medium', game: '8' };
  function renderMenu() {
    const seg = (m, opts) => `<div class="ph-seg">${opts.map(([v, k]) => `<button data-m="${m}" data-v="${v}" class="${menuSel[m] === v ? 'on' : ''}">${esc(S_(k))}</button>`).join('')}</div>`;
    el.menu.innerHTML = `<h2>🎱 ${esc(S_('title'))}</h2>
      ${seg('game', [['8', 'game8'], ['9', 'game9']])}
      <h3>${esc(S_('opponent'))}</h3>${seg('mode', [['ai', 'vsAI'], ['2p', 'twoP']])}
      ${menuSel.mode === 'ai' ? `<h3>${esc(S_('level'))}</h3>${seg('level', [['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard']])}` : ''}
      <button class="ph-go" data-a="start">${esc(S_(S.started ? 'newMatch' : 'start'))} · ${esc(S_('race'))}</button>
      ${S.started && !rules.matchOver ? `<div class="ph-seg"><button data-a="resume">${esc(S_('resume'))}</button><button data-a="rerack">${esc(S_('rerack'))}</button></div>` : ''}
      <p class="ph-note">${esc(S_(menuSel.game === '9' ? 'rulesHint9' : 'rulesHint'))}</p>`;
  }
  function showMenu(on) {
    if (on) { if (S.started) { menuSel.mode = S.mode; menuSel.level = S.level; menuSel.game = S.game; } renderMenu(); el.menu.classList.add('show'); if (S.phase === 'aim') S.phase = 'menu'; }
    else el.menu.classList.remove('show');
    updateHud();
  }
  function resume() { showMenu(false); if (S.phase === 'menu' && S.started && !S.banner) beginTurn(false); }
  function renderBanner() {
    const B = S.banner; if (!B) return;
    const nm = names();
    el.banner.innerHTML = `<div class="ph-res">${esc(B.msg)}</div>
      <div class="ph-sub">${esc(S.mode === 'ai' && B.win === 0 ? S_(B.match ? 'matchWonYou' : 'frameWonYou') : B.match ? S_('matchWon', nm[B.win]) : S_('frameWon', nm[B.win]))}</div>
      <div class="ph-sub">${esc(S_('frames'))}: ${esc(nm[0])} ${B.score[0]} – ${B.score[1]} ${esc(nm[1])}</div>
      <button class="ph-go" data-a="next">${esc(S_(B.match ? 'newMatch' : 'nextFrame'))}</button>
      <button data-a="bclose" style="min-height:46px">${esc(S_('close'))}</button>`;
  }
  function showBanner() { renderBanner(); el.banner.classList.add('show'); }
  function hideBanner() { el.banner.classList.remove('show'); S.banner = null; }
  const _pp = new THREE.Vector3();
  function updatePocketMarkers() {
    if (!root || !root.classList.contains('call')) return;
    for (const b of el.pks) {
      const k = T.pockets[+b.dataset.pk]; _pp.set(H.CX + k.x, SY + 0.02, H.CZ - k.y).project(camera);
      const vis = _pp.z < 1 && Math.abs(_pp.x) < 1.1 && Math.abs(_pp.y) < 1.1;
      b.style.visibility = vis ? '' : 'hidden';
      b.style.left = ((_pp.x + 1) / 2 * innerWidth).toFixed(1) + 'px'; b.style.top = ((1 - _pp.y) / 2 * innerHeight).toFixed(1) + 'px';
    }
  }

  /* ---------------------------------------------------------------- frame tick */
  let hudT = 0;
  function tick(dt) {
    if (!S.open) return;
    if (ctx.mode && ctx.mode !== 'walk') { close(true); return; }
    dt = Math.min(dt, 0.1);
    for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.dur); try { w.fn(k); } catch (_) {} if (k >= 1) { tweens.splice(i, 1); w.res(); } }
    let simDt = 0;
    if (S.phase === 'moving') {
      acc += dt; const h = sim.h; let n = 0;
      while (acc >= h && n < 240) { sim.step(); acc -= h; n++; simDt += h; }
      processEvents();
      if (!sim.moving()) { acc = 0; syncBalls(simDt); resolveShot(); }
    }
    syncBalls(simDt, dt);
    updateAim(); updateCue(dt);
    updateCamera(dt); updatePendant();
    updatePocketMarkers();
    if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0 && S.phase !== 'over') { S.msg = ''; if (el.msg) el.msg.textContent = ''; } }
    hudT += dt; if (hudT > 0.25) { hudT = 0; el.shoot && (el.shoot.disabled = !canShoot()); }
  }

  /* ---------------------------------------------------------------- open / close */
  function open(o = {}) {
    if (S.open) return Promise.resolve(true);
    const P = window.__tour && window.__tour.player;
    saved = { cpos: camera.position.clone(), cquat: camera.quaternion.clone(), fov: camera.fov, up: camera.up.clone(), st: P ? { ...P.state } : null };
    try { window.__tour.nav && window.__tour.nav.stopGlide && window.__tour.nav.stopGlide(); } catch (_) {}
    S.open = true; G.visible = true;
    if (!root) buildHud();
    root.style.display = ''; document.body.classList.add('pool-on');
    cam.pos.copy(camera.position); cam.look.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)); cam.up.set(0, 1, 0); cam.fov = camera.fov; cam.rate = 2.2;
    if (!sim) { // first open: physics state from the static rack shown on the table
      menuSel.mode = o.mode || menuSel.mode; menuSel.level = o.level || menuSel.level; menuSel.game = o.game || menuSel.game;
      rules = createRules(menuSel.game); sim = createSim(T); for (const p of rackPositions(T, menuSel.game, 7)) sim.addBall(p.id, p.x, p.y); sim.addBall(0, 0, T.headY);
      hideOffBalls(); syncBalls(0);
    }
    if (o.start) { S.mode = menuSel.mode; S.level = menuSel.level; S.game = menuSel.game; newMatch(); }
    else showMenu(true);
    untick = E.anim.tick((dt) => { try { tick(dt); } catch (e) { console.warn('[pool]', e); } });
    keyH = (e) => {
      if (!S.open) return;
      const k = e.key;
      e.stopImmediatePropagation();
      if (k === 'Escape') { e.preventDefault(); if (el.menu.classList.contains('show') && S.started) resume(); else close(); return; }
      if (!canAim()) return;
      const fine = e.shiftKey ? 0.0006 : 0.006;
      if (k === 'ArrowLeft') { S.aim += fine; e.preventDefault(); }
      else if (k === 'ArrowRight') { S.aim -= fine; e.preventDefault(); }
      else if (k === 'ArrowUp') { S.power = Math.max(0, S.power - 0.04); updatePower(); e.preventDefault(); }
      else if (k === 'ArrowDown') { S.power = Math.min(1, S.power + 0.04); updatePower(); e.preventDefault(); }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); humanShoot(); }
      else if (k === 'v' || k === 'V') { S.view = S.view === 'aim' ? 'top' : 'aim'; updateHud(); }
    };
    window.addEventListener('keydown', keyH, true);
    unlang = onLangChange(() => renderTexts());
    renderTexts();
    return Promise.resolve(true);
  }
  function close(instant) {
    if (!S.open) return Promise.resolve(false);
    S.open = false; if (S.phase === 'moving' || S.phase === 'shooting') { // finish the shot instantly so nothing is lost
      if (stroke && !stroke.fired) { stroke = null; S.phase = 'aim'; } else { stroke = null; while (sim.moving()) sim.step(); drops.length = 0; resolveShot(); }
    }
    S.open = false;
    if (S.phase === 'aim' || S.phase === 'ai') S.phase = 'menu';
    window.removeEventListener('keydown', keyH, true);
    if (unlang) { unlang(); unlang = null; }
    if (root) root.style.display = 'none';
    document.body.classList.remove('pool-on');
    el.spinPanel && el.spinPanel.classList.remove('show');
    for (const m of [aimL, objL, cueL, refL, ghost, cue]) m.visible = false;
    if (H.pendant) for (const c of H.pendant.children) c.visible = true;
    const sv = saved; saved = null;
    S.closing = true;
    const finish = () => {
      S.closing = false;
      if (untick) { untick(); untick = null; }
      G.visible = false;
      camera.up.set(0, 1, 0);
      if (sv) {
        camera.position.copy(sv.cpos); camera.quaternion.copy(sv.cquat); if (camera.fov !== sv.fov) { camera.fov = sv.fov; camera.updateProjectionMatrix(); }
        const P = window.__tour && window.__tour.player;
        if (P && sv.st) { Object.assign(P.state, sv.st); P.state.vx = P.state.vz = P.state.vy = 0; try { P.apply(); } catch (_) {} }
      }
      hideOffBalls(); syncBalls(0);
    };
    if (instant || !sv) { finish(); return Promise.resolve(true); }
    // fly back to where we were (≈0.7 s), then hand the camera back to the walker
    const look = sv.cpos.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(sv.cquat));
    const p0 = cam.pos.clone(), l0 = cam.look.clone(), u0 = cam.up.clone(), f0 = cam.fov;
    let tt = 0;
    return new Promise((res) => {
      if (untick) untick();
      untick = E.anim.tick((dt) => {
        tt += Math.min(dt, 0.05); const k = Math.min(1, tt / 0.7), e = k * k * (3 - 2 * k);
        cam.pos.lerpVectors(p0, sv.cpos, e); cam.look.lerpVectors(l0, look, e); cam.up.lerpVectors(u0, up, e).normalize(); cam.fov = f0 + (sv.fov - f0) * e;
        applyCam();
        if (k >= 1) { finish(); res(true); return false; }
      });
    });
  }

  /* ---------------------------------------------------------------- api (tests / other modules) */
  const api = {
    open, close, rerack, get isOpen() { return S.open; }, get isClosing() { return !!S.closing; }, get state() { return S; }, get sim() { return sim; }, get rules() { return rules; },
    get phase() { return S.phase; }, get preview() { return preview; },
    start(o = {}) { Object.assign(menuSel, o); S.mode = menuSel.mode; S.level = menuSel.level; S.game = menuSel.game; showMenu(false); newMatch(); },
    setAim(a) { S.aim = a; }, setPower(p) { S.power = p; updatePower(); }, setSpin(x, y) { S.sx = x; S.sy = y; updateHud(); }, setView(v) { S.view = v; updateHud(); },
    shoot: humanShoot, placeCue: (x, y) => { if (rules && rules.ballInHand) placeCueAt(x, y); }, callPocket: (k) => { S.called = k; S.calledManual = true; updateHud(); },
    /** test helper: aim at ball `id` straight (centre to centre) */
    aimAt(id) { const c = sim.ball(0), b = sim.ball(id); if (c && b) S.aim = Math.atan2(b.y - c.y, b.x - c.x); },
    strings: POOL_STRINGS,
  };
  return api;
}
