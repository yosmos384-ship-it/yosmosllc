// i18n.js — V7: languages. Hebrew (default), English, Spanish. 🇮🇱 עברית · 🇺🇸 English · 🇲🇽 Español.
// How it works:
//  - The whole tour is written in Hebrew. Every user-visible Hebrew string has an entry in DICT (he → [en, es]).
//    Entries may hold placeholders {0} {1}: "פותח: {0}" matches "פותח: דלת כניסה" and translates the captured part too.
//  - t(he, ...args) translates one string; tr(str) translates ANY composed string (exact → without emoji / symbols
//    → patterns → split on " · ", " — ", ": " … and translate each part). Missing strings are collected in
//    i18n.missing (tests read it).
//  - The DOM translator (a MutationObserver on <body>) keeps every Hebrew text node and the title / aria-label /
//    placeholder / alt attributes in the current language — so toasts, the hover label of 3D objects (labels that are
//    functions are re-evaluated by core on every hover and then translated here), panels, chips, the loading screen,
//    the gallery, the TV and radio panels all switch without per-module code. The Hebrew source of every node is
//    remembered, so switching back to Hebrew restores it exactly.
//  - Canvas text (minimap, 360 labels, TV card) calls tr() at draw time and redraws on onLangChange().
//  - Language choice: ?lang= in the URL → the switcher choice saved in localStorage ('eakin_lang', the ONLY UI choice
//    that survives a refresh) → browser language (es* → es, he* / iw* → he, everything else → en).
// No side effects on import (initI18n() starts it; index.html calls it before core.js loads).

export const LANGS = [
  { id: 'he', flag: '🇮🇱', name: 'עברית', dir: 'rtl', html: 'he' },
  { id: 'en', flag: '🇺🇸', name: 'English', dir: 'ltr', html: 'en' },
  { id: 'es', flag: '🇲🇽', name: 'Español', dir: 'ltr', html: 'es' },
];
const LS = 'eakin_lang';
const HEB = /[֐-׿]/;
const COL = { en: 0, es: 1 };

/* ============================================================================================ dictionary */
// he → [en, es]
export const DICT = {
  // ---- document / loader / intro / version
  '3351 Eakin Rd — סיור 3D': ['3351 Eakin Rd — 3D tour', '3351 Eakin Rd — recorrido 3D'],
  'סיור תלת-ממדי אינטראקטיבי בבית ב-3351 Eakin Rd, Columbus OH — אחרי שיפוץ: הליכה, 360°, דולהאוס ותוכנית קומה.': ['Interactive 3D tour of the house at 3351 Eakin Rd, Columbus OH — after renovation: walk-through, 360°, dollhouse and floor plan.', 'Recorrido 3D interactivo por la casa en 3351 Eakin Rd, Columbus OH — después de la remodelación: caminar, 360°, casa de muñecas y plano.'],
  'סיור תלת-ממדי': ['3D tour', 'Recorrido 3D'],
  'אחרי שיפוץ': ['after renovation', 'después de la remodelación'],
  '(אחרי שיפוץ)': ['(after renovation)', '(después de la remodelación)'],
  'מאתחל מנוע תלת-ממד…': ['Starting the 3D engine…', 'Iniciando el motor 3D…'],
  'יש להפעיל JavaScript כדי לצפות בסיור.': ['Please enable JavaScript to view the tour.', 'Activa JavaScript para ver el recorrido.'],
  'הדפדפן אינו תומך ב-WebGL': ['This browser does not support WebGL', 'Este navegador no admite WebGL'],
  'טעינת מנוע התלת-ממד נכשלה (three.js / core.js) — בדקו חיבור לאינטרנט ורעננו': ['The 3D engine failed to load (three.js / core.js) — check your connection and refresh', 'No se pudo cargar el motor 3D (three.js / core.js) — revisa tu conexión y recarga'],
  'סיור בבית אחרי שיפוץ': ['Tour the renovated house', 'Recorre la casa remodelada'],
  'סיור בבית אחרי שיפוץ · או בחרו מצב בסרגל העליון': ['Tour the renovated house · or pick a mode at the top', 'Recorre la casa remodelada · o elige un modo arriba'],
  'סיור בבית אחרי שיפוץ · או בחרו מצב תצוגה בסרגל העליון': ['Tour the renovated house · or pick a view mode in the top bar', 'Recorre la casa remodelada · o elige un modo de vista en la barra superior'],
  'כניסה לסיור': ['Enter the tour', 'Entrar al recorrido'],
  '3351 Eakin Rd — כניסה לסיור': ['3351 Eakin Rd — enter the tour', '3351 Eakin Rd — entrar al recorrido'],
  'גרסה 9': ['Version 9', 'Versión 9'],
  'גרסה 10': ['Version 10', 'Versión 10'],
  'גרסה 11': ['Version 11', 'Versión 11'],
  'גרסה 12': ['Version 12', 'Versión 12'],
  'גרסה 12.1': ['Version 12.1', 'Versión 12.1'],
  // ---- V12: round floating buttons (the size of "פעולה") with a 1-line label
  'אקסל': ['Excel', 'Excel'],
  'פירוט': ['Details', 'Detalle'],
  'הקישו ליציאה': ['tap to exit', 'toca para salir'],
  // ---- V11: "📋 שיפוץ לפי האקסל" (scope-of-work mode: js/sow.js, js/sow-ui.js, js/sow-build.js)
  'שיפוץ לפי האקסל': ['Scope-of-work rehab', 'Remodelación según presupuesto'],
  '📋 שיפוץ לפי האקסל': ['📋 Scope-of-work rehab', '📋 Remodelación según presupuesto'],
  'מצב: שיפוץ לפי האקסל': ['Mode: scope-of-work rehab', 'Modo: remodelación según presupuesto'],
  'יציאה': ['Exit', 'Salir'],
  'פירוט השיפוץ': ['Rehab breakdown', 'Detalle de la remodelación'],
  '📋 פירוט השיפוץ': ['📋 Rehab breakdown', '📋 Detalle de la remodelación'],
  'שיפוץ לפי תקציב המלווה (Scope of Work): הבית האמיתי + רק מה שבתקציב': ['Rehab per the lender\'s budget (Scope of Work): the real house + only what is budgeted', 'Remodelación según el presupuesto del prestamista (Scope of Work): la casa real + solo lo presupuestado'],
  'הסיור עדיין נטען — אפשר להפעיל אחרי הטעינה': ['The tour is still loading — you can turn it on afterwards', 'El recorrido aún se está cargando — podrás activarlo después'],
  'יוצאים ממצב שיפוץ לפי האקסל…': ['Leaving the scope-of-work rehab mode…', 'Saliendo del modo remodelación según presupuesto…'],
  'עוברים לשיפוץ לפי האקסל…': ['Switching to the scope-of-work rehab…', 'Cambiando a la remodelación según presupuesto…'],
  'הבית האמיתי + רק מה שבתקציב': ['the real house + only what is budgeted', 'la casa real + solo lo presupuestado'],
  'חזרה לעיצוב היוקרתי': ['Back to the luxury design', 'De vuelta al diseño de lujo'],
  'תקציב השיפוץ של המלווה (Scope of Work). הקישו על שורה כדי ללכת לחדר ולראות את הפריט.': ['The lender\'s rehab budget (Scope of Work). Tap a line to walk to the room and see the item.', 'El presupuesto de remodelación del prestamista (Scope of Work). Toca una línea para ir a la estancia y ver el elemento.'],
  'סה״כ': ['Total', 'Total'],
  'לא בתקציב (נשאר כמו שהוא):': ['Not in the budget (stays as-is):', 'Fuera del presupuesto (queda igual):'],
  'הולכים אל: {0}': ['Going to: {0}', 'Vamos a: {0}'],
  '⇆ לפני / אחרי': ['⇆ Before / after', '⇆ Antes / después'],
  'לפני / אחרי': ['Before / after', 'Antes / después'],
  'לפני · היום (מהסרטון)': ['Before · today (from the video)', 'Antes · hoy (del video)'],
  'אחרי · לפי האקסל': ['After · per the budget', 'Después · según el presupuesto'],
  'לפני': ['Before', 'Antes'],
  'ההדמיה של שיפוץ לפי האקסל לחדר הזה עדיין בהכנה': ['The scope-of-work render of this room is still being prepared', 'El render de la remodelación según presupuesto de esta estancia aún se está preparando'],
  'טוען הדמיה…': ['Loading render…', 'Cargando render…'],
  'הפעל מאוורר תקרה': ['Turn on the ceiling fan', 'Encender el ventilador de techo'],
  'כבה מאוורר תקרה': ['Turn off the ceiling fan', 'Apagar el ventilador de techo'],
  'הריסה ופינוי פסולת (פירוק פנים)': ['Demo & trash out (interior demo)', 'Demolición y retiro de escombros (interior)'],
  'מכשירי מטבח חדשים: מדיח, תנור, קולט, מקרר': ['New kitchen appliances: dishwasher, range, hood, fridge', 'Electrodomésticos nuevos: lavavajillas, estufa, campana, refrigerador'],
  'ארונות מטבח: מטבח חדש + משטח + חיפוי': ['Kitchen cabinetry: full new kitchen + countertop + backsplash', 'Gabinetes de cocina: cocina nueva + encimera + salpicadero'],
  'שיפוץ מלא של 2 חדרי רחצה כולל אריחים': ['Full remodel of 2 bathrooms, tiles included', 'Remodelación completa de 2 baños, azulejos incluidos'],
  'ריצוף LVP חדש בכל הבית': ['New LVP flooring in the entire house', 'Piso LVP nuevo en toda la casa'],
  'דלתות פנים ומשקופים': ['Interior doors and trim', 'Puertas interiores y molduras'],
  'צביעת פנים מלאה: קירות ותקרות': ['Full interior paint: walls and ceilings', 'Pintura interior completa: paredes y techos'],
  'דוד מים חמים': ['Water heater', 'Calentador de agua'],
  'מיזוג אוויר (מעבה חיצוני)': ['HVAC A/C (outdoor condenser)', 'Aire acondicionado (condensador exterior)'],
  'תנור חימום (פורנס)': ['HVAC furnace', 'Calefacción (horno)'],
  'גופי תאורה ומאווררי תקרה חדשים': ['New light fixtures and ceiling fans', 'Lámparas y ventiladores de techo nuevos'],
  'לוח חשמל חדש': ['New electrical panel', 'Tablero eléctrico nuevo'],
  'שקעים ומתגים חדשים': ['New receptacles and switches', 'Enchufes e interruptores nuevos'],
  'תיקוני גבס לפי הצורך': ['Drywall repairs where needed', 'Reparaciones de yeso donde haga falta'],
  'גלאי עשן וניקיון אחרי השיפוץ': ['Smoke detectors and post-rehab cleaning', 'Detectores de humo y limpieza tras la remodelación'],
  'מרזבים': ['Gutters', 'Canaletas'],
  'סופיט': ['Soffit', 'Sofito'],
  'חיפוי / טיח חוץ': ['Siding / stucco', 'Revestimiento / estuco'],
  'צבע חוץ': ['Exterior paint', 'Pintura exterior'],
  'דלתות חוץ': ['Exterior doors', 'Puertas exteriores'],
  'חלונות': ['Windows', 'Ventanas'],
  'שביל החניה': ['Driveway', 'Entrada de coches'],
  'גדרות': ['Fencing', 'Cercas'],
  'גינון': ['Landscaping', 'Jardinería'],
  'גימור המרתף': ['Basement finishing', 'Acabado del sótano'],
  'בידוד': ['Insulation', 'Aislamiento'],
  'שפה': ['Language', 'Idioma'],
  'בחירת שפה': ['Choose language', 'Elegir idioma'],
  'חלק מהרכיבים לא נטענו': ['Some components did not load', 'Algunos componentes no se cargaron'],
  'הסיור ממשיך לעבוד עם שאר החלקים.': ['The tour keeps working with the other parts.', 'El recorrido sigue funcionando con las demás partes.'],
  'סגור': ['Close', 'Cerrar'],
  'ממתין': ['waiting', 'en espera'],
  'טוען…': ['loading…', 'cargando…'],
  'בונה…': ['building…', 'construyendo…'],
  '✓ מוכן': ['✓ ready', '✓ listo'],
  '✗ נכשל': ['✗ failed', '✗ falló'],
  'טוען {0}': ['Loading {0}', 'Cargando {0}'],
  'בונה {0}': ['Building {0}', 'Construyendo {0}'],
  'מבנה הבית': ['house structure', 'estructura de la casa'],
  'פנים, מטבח ורהיטים': ['interior, kitchen and furniture', 'interior, cocina y muebles'],
  'חצר, רחוב ושכנים': ['yard, street and neighbours', 'jardín, calle y vecinos'],
  'המודול לא מייצא build(ctx)': ['the module does not export build(ctx)', 'el módulo no exporta build(ctx)'],
  'תם הזמן (90 ש׳)': ['timed out (90 s)', 'tiempo agotado (90 s)'],
  'מכין תאורה, צללים וסריקה…': ['Preparing lighting, shadows and scan…', 'Preparando iluminación, sombras y escaneo…'],
  'מכין השתקפויות ותאורת חלונות…': ['Preparing reflections and window light…', 'Preparando reflejos y luz de ventanas…'],
  'משטחי הליכה': ['walkable surfaces', 'superficies transitables'],
  'ניווט (גרף)': ['navigation (graph)', 'navegación (grafo)'],
  'מסגור 360': ['360 framing', 'encuadre 360'],
  'צללים': ['shadows', 'sombras'],
  'סגנונות שיפוץ': ['renovation styles', 'estilos de remodelación'],
  'רינדור V2': ['V2 rendering', 'renderizado V2'],
  'תאורה': ['lighting', 'iluminación'],
  'רינדור': ['rendering', 'renderizado'],
  'ניווט': ['navigation', 'navegación'],
  'שחקן': ['player', 'jugador'],
  'מעבר מצב': ['mode change', 'cambio de modo'],
  'שגיאת זמן ריצה': ['runtime error', 'error de ejecución'],
  'שגיאה אסינכרונית': ['async error', 'error asíncrono'],
  'פעולה: {0}': ['Action: {0}', 'Acción: {0}'],
  'טעינת אפקטים': ['loading effects', 'carga de efectos'],
  'אפקטים (post-processing)': ['effects (post-processing)', 'efectos (post-processing)'],
  'השתקפויות חדרים': ['room reflections', 'reflejos de las habitaciones'],
  'נרמול חומרים': ['material normalisation', 'normalización de materiales'],
  'תאורת חלונות': ['window lighting', 'luz de ventanas'],
  'סביבת תאורה': ['lighting environment', 'entorno de iluminación'],
  'תצוגת הדמיה': ['render view', 'vista de render'],
  'האפקטים הגרפיים כובו — ממשיכים ברינדור רגיל': ['Graphics effects were turned off — continuing with normal rendering', 'Se desactivaron los efectos gráficos — se continúa con el renderizado normal'],

  // ---- mode bar
  'מצבי תצוגה': ['View modes', 'Modos de vista'],
  'הליכה בגוף ראשון (1)': ['First-person walk (1)', 'Caminar en primera persona (1)'],
  'הליכה': ['Walk', 'Caminar'],
  'סיור פנורמי 360° (2)': ['360° panoramic tour (2)', 'Recorrido panorámico 360° (2)'],
  'סיור 360°': ['360° tour', 'Recorrido 360°'],
  'סריקה / דולהאוס (3)': ['Scan / dollhouse (3)', 'Escaneo / casa de muñecas (3)'],
  'דולהאוס': ['Dollhouse', 'Maqueta'],
  'סריקה /': ['Scan /', 'Escaneo /'],
  'תוכנית קומה (4)': ['Floor plan (4)', 'Plano de planta (4)'],
  'תוכנית קומה': ['Floor plan', 'Plano de planta'],

  // ---- tools
  'כלים': ['Tools', 'Herramientas'],
  'כלים נוספים': ['More tools', 'Más herramientas'],
  'יום / ערב / לילה': ['Day / evening / night', 'Día / tarde / noche'],
  'יום': ['Day', 'Día'], 'ערב': ['Evening', 'Tarde'], 'לילה': ['Night', 'Noche'],
  'מדידה (M)': ['Measure (M)', 'Medir (M)'], 'מדידה': ['Measure', 'Medir'],
  'פנס (Q / F)': ['Flashlight (Q / F)', 'Linterna (Q / F)'], 'פנס': ['Flashlight', 'Linterna'],
  'איכות גרפיקה': ['Graphics quality', 'Calidad gráfica'],
  'איכות גבוהה': ['High quality', 'Calidad alta'], 'איכות חסכונית': ['Economy quality', 'Calidad económica'],
  'שמע': ['Sound', 'Sonido'],
  'רכיבים שנכשלו': ['Failed components', 'Componentes con error'], 'שגיאות': ['Errors', 'Errores'],
  'סגנון השיפוץ — אפשרויות חומרים וצבעים': ['Renovation style — material and colour options', 'Estilo de remodelación — opciones de materiales y colores'],
  'סגנון שיפוץ': ['Renovation style', 'Estilo de remodelación'],
  'חצי תנועה על המסך': ['On-screen arrow pad', 'Flechas de movimiento en pantalla'],
  'חצי תנועה': ['Arrow pad', 'Flechas'],
  'עזרה': ['Help', 'Ayuda'],
  'התחלה מחדש': ['Start over', 'Empezar de nuevo'],
  'התחלה מחדש — חזרה למצב ההתחלתי': ['Start over — back to the initial state', 'Empezar de nuevo — volver al estado inicial'],
  'מתחילים מחדש…': ['Starting over…', 'Empezando de nuevo…'],
  'מצב ניווט': ['Navigation mode', 'Modo de navegación'],
  'ניווט בלחיצות: גרירה = הסתכלות · קליק על חץ = מעבר · לחיצה כפולה = הליכה (N)': ['Click navigation: drag = look · click an arrow = move · double-click = walk (N)', 'Navegación con clics: arrastrar = mirar · clic en una flecha = moverse · doble clic = caminar (N)'],
  'ניווט בלחיצות': ['Click navigation', 'Navegación con clics'],
  'ניווט חופשי: נעילת עכבר + WASD (N)': ['Free navigation: mouse lock + WASD (N)', 'Navegación libre: bloqueo del ratón + WASD (N)'],
  'חופשי (WASD)': ['Free (WASD)', 'Libre (WASD)'],

  // ---- V10 CORE: room picker, worlds (limo / casino), limo parking spot
  'בחירת חדר': ['Choose a room', 'Elegir estancia'],
  'עולמות': ['Worlds', 'Mundos'], 'עולם': ['World', 'Mundo'],
  'הקישו על חדר — הולכים אליו': ['Tap a room — walk there', 'Toca una estancia — camina hasta allí'],
  'הולכים אל {0}': ['Walking to {0}', 'Caminando a {0}'],
  'הגעתם: {0}': ['You are in: {0}', 'Llegaste: {0}'],
  'ההליכה בוטלה': ['Walk cancelled', 'Caminata cancelada'],
  '🚘 לימוזינה': ['🚘 Limousine', '🚘 Limusina'],
  'לימוזינה': ['Limousine', 'Limusina'],
  '🚘 עלה ללימוזינה': ['🚘 Get in the limousine', '🚘 Subir a la limusina'],
  'עלה ללימוזינה': ['Get in the limousine', 'Subir a la limusina'],
  'הלימוזינה מחכה · הקישו על הדלת או על 🚘 כדי לעלות': ['The limousine is waiting · tap the door or 🚘 to get in', 'La limusina te espera · toca la puerta o 🚘 para subir'],
  'הלימוזינה מחכה ליד המדרכה': ['The limousine is waiting at the curb', 'La limusina espera junto a la acera'],
  'קזינו': ['Casino', 'Casino'],
  '⟵ חזרה הביתה': ['⟵ Back home', '⟵ Volver a casa'],
  'חזרה הביתה': ['Back home', 'Volver a casa'],
  '🏠 הביתה': ['🏠 Home', '🏠 Casa'],
  'הביתה': ['Home', 'Casa'],
  'בקרוב': ['Coming soon', 'Próximamente'],
  '🚧 בקרוב': ['🚧 Coming soon', '🚧 Próximamente'],
  'טוען {0}…': ['Loading {0}…', 'Cargando {0}…'],
  'טוען עולם…': ['Loading…', 'Cargando…'],
  'הטעינה נכשלה — חוזרים': ['Loading failed — going back', 'Falló la carga — regresando'],
  'זמין רק בבית': ['Available only at the house', 'Disponible solo en la casa'],
  'עולם בדיקה': ['Test world', 'Mundo de prueba'],
  'חדר בדיקה א׳': ['Test room A', 'Sala de prueba A'],
  'חדר בדיקה ב׳': ['Test room B', 'Sala de prueba B'],
  'עמוד בדיקה': ['Test pillar', 'Pilar de prueba'],
  'עבור לחדר הזה בהליכה': ['Walk to this room', 'Caminar a esta estancia'],

  // ---- minimap / floors / rooms
  'מפה — איפה אנחנו': ['Map — where we are', 'Mapa — dónde estamos'],
  'הקש להגדלת המפה': ['Tap to enlarge the map', 'Toca para ampliar el mapa'],
  'קומה עליונה': ['Upper floor', 'Planta alta'], 'קומת כניסה': ['Main floor', 'Planta baja'], 'מרתף': ['Basement', 'Sótano'], 'חוץ': ['Outside', 'Exterior'], 'גג': ['Roof', 'Techo'],
  'סינון קומות': ['Floor filter', 'Filtro de plantas'], 'הכול': ['All', 'Todo'], 'קירות חוץ שקופים': ['See-through exterior walls', 'Muros exteriores transparentes'],
  'חדר שינה 1': ['Bedroom 1', 'Recámara 1'], 'חדר שינה 2': ['Bedroom 2', 'Recámara 2'], 'חדר שינה 3': ['Bedroom 3', 'Recámara 3'], 'חדר שינה 4': ['Bedroom 4', 'Recámara 4'],
  'חדר רחצה 1': ['Bathroom 1', 'Baño 1'], 'חדר רחצה 2': ['Bathroom 2', 'Baño 2'],
  'מסדרון': ['Hallway', 'Pasillo'], 'מטבח': ['Kitchen', 'Cocina'], 'סלון': ['Living room', 'Sala'], 'מבואה': ['Landing', 'Descanso'],
  'רחוב': ['Street', 'Calle'], 'חצר קדמית': ['Front yard', 'Jardín delantero'], 'מרפסת כניסה': ['Front porch', 'Porche de entrada'], 'חצר אחורית': ['Backyard', 'Patio trasero'],
  'חצר צדדית מערבית': ['West side yard', 'Patio lateral oeste'], 'חצר צדדית מזרחית': ['East side yard', 'Patio lateral este'], 'רחוב Eakin Rd': ['Eakin Rd (street)', 'Calle Eakin Rd'],
  'שביל הכניסה': ['Front walk', 'Camino de entrada'], 'כניסה אחורית': ['Back entrance', 'Entrada trasera'], 'חניה': ['Driveway', 'Cochera'], 'חצר צדדית': ['Side yard', 'Patio lateral'],
  'חזית ורחוב': ['Front and street', 'Fachada y calle'],
  'דלת כניסה': ['Front door', 'Puerta principal'], 'דלת אחורית': ['Back door', 'Puerta trasera'], 'דלת חדר רחצה': ['Bathroom door', 'Puerta del baño'],
  'דלת חדר שינה 1': ['Bedroom 1 door', 'Puerta de la recámara 1'], 'דלת חדר שינה 2': ['Bedroom 2 door', 'Puerta de la recámara 2'], 'דלת חדר שינה 3': ['Bedroom 3 door', 'Puerta de la recámara 3'], 'דלת חדר שינה 4': ['Bedroom 4 door', 'Puerta de la recámara 4'],
  'דלת חדר רחצה 2': ['Bathroom 2 door', 'Puerta del baño 2'], 'דלת למרתף': ['Basement door', 'Puerta del sótano'],
  'הדלת': ['The door', 'La puerta'],
  '{0} סגורה': ['{0} is closed', '{0} está cerrada'],
  'פותח: {0}': ['Opening: {0}', 'Abriendo: {0}'],
  'הדרך חסומה — עצרתי': ['The way is blocked — stopped', 'El camino está bloqueado — me detuve'],
  'אין דרך להגיע לנקודה הזו': ['There is no way to reach this spot', 'No hay forma de llegar a este punto'],
  'אין מעבר בכיוון הזה': ['No passage in this direction', 'No hay paso en esta dirección'],
  'נכנס אל {0}': ['Entering {0}', 'Entrando a {0}'],
  'הקש על חדר כדי להיכנס אליו': ['Tap a room to enter it', 'Toca una habitación para entrar'],
  'לא נמצא משטח': ['No surface found', 'No se encontró una superficie'],
  'אין נקודות 360 זמינות': ['No 360 spots available', 'No hay puntos 360 disponibles'],
  'אין נקודת 360 בכיוון הזה': ['No 360 spot in this direction', 'No hay punto 360 en esta dirección'],

  // ---- hints / hover
  'פעולה': ['Action', 'Acción'],
  'הקש על אובייקט או לחץ "פעולה"': ['Tap an object or press "Action"', 'Toca un objeto o pulsa "Acción"'],
  'לחץ E / הקלק לפעולה': ['Press E / click to interact', 'Pulsa E / haz clic para interactuar'],
  'הקש / פעולה': ['Tap / Action', 'Toca / Acción'],
  'E / קליק': ['E / click', 'E / clic'],
  'טיפ: Q / F להדלקת פנס': ['Tip: Q / F turns on the flashlight', 'Consejo: Q / F enciende la linterna'],
  'גרור עם העכבר כדי להסתכל · WASD / חצים לתנועה': ['Drag with the mouse to look · WASD / arrows to move', 'Arrastra con el ratón para mirar · WASD / flechas para moverte'],
  'הקלק על המסך כדי לשלוט · WASD לתנועה · Shift לריצה': ['Click the screen to take control · WASD to move · Shift to run', 'Haz clic en la pantalla para controlar · WASD para moverte · Shift para correr'],
  'הקש על חץ כדי לעבור לחדר · הקשה כפולה על הרצפה = הליכה · גרירה = הסתכלות': ['Tap an arrow to go to a room · double-tap the floor = walk · drag = look', 'Toca una flecha para ir a una habitación · doble toque en el piso = caminar · arrastrar = mirar'],
  'גרור כדי להסתכל · קליק על חץ = מעבר לחדר · לחיצה כפולה על הרצפה = הליכה · WASD לתנועה': ['Drag to look · click an arrow = go to a room · double-click the floor = walk · WASD to move', 'Arrastra para mirar · clic en una flecha = ir a una habitación · doble clic en el piso = caminar · WASD para moverte'],
  'גרור עם העכבר כדי להסתכל · WASD / חצים לתנועה · לחיצה כפולה = הליכה': ['Drag with the mouse to look · WASD / arrows to move · double-click = walk', 'Arrastra con el ratón para mirar · WASD / flechas para moverte · doble clic = caminar'],
  'הקלק על המסך כדי לשלוט · WASD לתנועה · Shift לריצה · לחיצה כפולה = הליכה': ['Click the screen to take control · WASD to move · Shift to run · double-click = walk', 'Haz clic en la pantalla para controlar · WASD para moverte · Shift para correr · doble clic = caminar'],
  'מדידה: סמן שתי נקודות על משטחים · Esc לניקוי': ['Measure: mark two points on surfaces · Esc to clear', 'Medir: marca dos puntos en superficies · Esc para borrar'],
  '📏 מדידה — סמן שתי נקודות על משטחים': ['📏 Measure — mark two points on surfaces', '📏 Medir — marca dos puntos en superficies'],
  'נקה': ['Clear', 'Borrar'], 'סיום': ['Done', 'Listo'],
  '{0} מ׳ · {1}′ {2}″': ['{0} m · {1}′ {2}″', '{0} m · {1}′ {2}″'],
  'מ׳': ['m', 'm'],
  '{0} מ״ר': ['{0} m²', '{0} m²'],
  'קדימה': ['Forward', 'Adelante'], 'סיבוב שמאלה': ['Turn left', 'Girar a la izquierda'], 'סיבוב ימינה': ['Turn right', 'Girar a la derecha'], 'אחורה': ['Back', 'Atrás'],
  '4 חדרי שינה': ['4 bedrooms', '4 recámaras'], '2 חדרי רחצה': ['2 bathrooms', '2 baños'],
  '2 חדרי רחצה (אחרי שיפוץ)': ['2 bathrooms (after renovation)', '2 baños (después de la remodelación)'],

  // ---- 360 panel / photoreal
  'נקודות 360': ['360 spots', 'Puntos 360'],
  'גרור כדי להסתכל · גלגלת / צביטה לזום · הקלק על טבעת כדי לעבור': ['Drag to look · wheel / pinch to zoom · click an arrow to move', 'Arrastra para mirar · rueda / pellizco para zoom · clic en una flecha para moverte'],
  'הדמיה מציאותית במעקב קרניים (path tracing) של כל ה-360°': ['Photoreal path-traced render of the whole 360°', 'Render fotorrealista con trazado de rayos (path tracing) de todo el 360°'],
  'הדמיה מציאותית': ['Photoreal render', 'Render fotorrealista'],
  'הדמיה מציאותית ברזולוציה גבוהה של המבט הנוכחי': ['High-resolution photoreal render of the current view', 'Render fotorrealista en alta resolución de la vista actual'],
  'הדמיה של המבט הנוכחי': ['Render the current view', 'Render de la vista actual'],
  'עצור את ההדמיה': ['Stop the render', 'Detener el render'], 'עצור': ['Stop', 'Detener'],
  'הורדת ההדמיה כ-PNG': ['Download the render as PNG', 'Descargar el render como PNG'], 'הורד PNG': ['Download PNG', 'Descargar PNG'],
  'חזרה לתצוגה החיה': ['Back to the live view', 'Volver a la vista en vivo'], 'חזרה לתצוגה חיה': ['Back to live view', 'Volver a la vista en vivo'],
  'סיבוב אוטומטי': ['Auto-rotate', 'Giro automático'],
  'הורדת תמונה פנורמית 4096×2048': ['Download a 4096×2048 panorama', 'Descargar una panorámica de 4096×2048'], 'הורד תמונת 360': ['Download 360 image', 'Descargar imagen 360'],
  'מכין…': ['Preparing…', 'Preparando…'], 'כלי 360': ['360 tools', 'Herramientas 360'],
  'מייצר תמונת 360… (4096×2048)': ['Creating the 360 image… (4096×2048)', 'Creando la imagen 360… (4096×2048)'],
  'תמונת 360 נשמרה ✓': ['360 image saved ✓', 'Imagen 360 guardada ✓'], 'הייצוא נכשל': ['Export failed', 'La exportación falló'],
  'טוען מנוע הדמיה מציאותית…': ['Loading the photoreal engine…', 'Cargando el motor fotorrealista…'],
  'בונה סצנה למעקב קרניים (BVH)…': ['Building the path-tracing scene (BVH)…', 'Construyendo la escena de trazado de rayos (BVH)…'],
  'מכין שיידרים… (עשוי לקחת כמה שניות)': ['Preparing shaders… (may take a few seconds)', 'Preparando shaders… (puede tardar unos segundos)'],
  'לא ניתן לטעון את מנוע ההדמיה המציאותית (בדקו חיבור לרשת) — מוצג רינדור באיכות גבוהה (AO, דגימת-יתר)': ['The photoreal engine could not be loaded (check your connection) — showing a high-quality render instead (AO, supersampling)', 'No se pudo cargar el motor fotorrealista (revisa tu conexión) — se muestra un render de alta calidad (AO, supermuestreo)'],
  'ההדמיה המציאותית (מעקב קרניים) כבדה מדי לטלפון ודורשת מחשב — מוצג במקומה רינדור באיכות גבוהה. לחוויה המלאה פתחו את הסיור במחשב.': ['The photoreal (path-traced) render is too heavy for a phone and needs a computer — a high-quality render is shown instead. Open the tour on a computer for the full experience.', 'El render fotorrealista (trazado de rayos) es demasiado pesado para un teléfono y requiere una computadora — se muestra un render de alta calidad. Abre el recorrido en una computadora para la experiencia completa.'],
  'כרטיס המסך / הדפדפן כאן אינו תומך בהדמיה המציאותית — מוצג רינדור באיכות גבוהה (פרטים בקונסול)': ['This graphics card / browser does not support the photoreal render — showing a high-quality render (details in the console)', 'Esta tarjeta gráfica / navegador no admite el render fotorrealista — se muestra un render de alta calidad (detalles en la consola)'],
  'ההדמיה המציאותית נכשלה (פרטים בקונסול) — מוצג רינדור באיכות גבוהה (AO, דגימת-יתר)': ['The photoreal render failed (details in the console) — showing a high-quality render (AO, supersampling)', 'El render fotorrealista falló (detalles en la consola) — se muestra un render de alta calidad (AO, supermuestreo)'],
  'ההדמיה המציאותית זמינה במצב סיור 360°': ['The photoreal render is available in 360° tour mode', 'El render fotorrealista está disponible en el modo recorrido 360°'],
  'הדמיה מהזיכרון ✓': ['Render from memory ✓', 'Render desde la memoria ✓'],
  'דוגם {0}': ['Sampling {0}', 'Muestreando {0}'],
  'ההדמיה המציאותית הושלמה ✓ — גררו כדי להסתכל מסביב': ['Photoreal render complete ✓ — drag to look around', 'Render fotorrealista completo ✓ — arrastra para mirar alrededor'],
  'מרנדר 360 באיכות גבוהה…': ['Rendering 360 in high quality…', 'Renderizando 360 en alta calidad…'],
  'הדמיה 360': ['360 render', 'Render 360'], 'ההדמיה של המבט הושלמה ✓': ['The view render is complete ✓', 'El render de la vista está completo ✓'],
  'הדמיית מבט': ['View render', 'Render de vista'], 'עוצר…': ['Stopping…', 'Deteniendo…'],
  'אין הדמיה להורדה': ['No render to download', 'No hay render para descargar'], 'התמונה נשמרה ✓': ['Image saved ✓', 'Imagen guardada ✓'], 'ההורדה נכשלה': ['Download failed', 'La descarga falló'],
  'למעלה': ['Up', 'Arriba'], 'למטה': ['Down', 'Abajo'], 'פנימה': ['Inside', 'Adentro'], 'החוצה': ['Outside', 'Afuera'],
  'קומה עליונה · מבואה': ['Upper floor · landing', 'Planta alta · descanso'], 'קומת כניסה · מסדרון': ['Main floor · hallway', 'Planta baja · pasillo'], 'מדרגות למרתף': ['Stairs to the basement', 'Escaleras al sótano'],

  // ---- radio
  'רדיו': ['Radio', 'Radio'],
  'רדיו להיטים': ['Hits radio', 'Radio de éxitos'],
  'להיטים': ['Hits', 'Éxitos'],
  'רדיו גיבוי': ['Backup radio', 'Radio de respaldo'],
  'השידור החי עובד באתר yosmosllc.com': ['Live radio works on yosmosllc.com', 'La radio en vivo funciona en yosmosllc.com'],
  'השידור לא זמין כרגע': ['The broadcast is unavailable right now', 'La transmisión no está disponible ahora'],
  'התחנה לא זמינה כרגע': ['This station is unavailable right now', 'Esta estación no está disponible ahora'],
  'התחנה לא זמינה כרגע ({0}) — עוברים ל-{1}': ['Station unavailable ({0}) — switching to {1}', 'Estación no disponible ({0}) — cambiando a {1}'],
  'התחנה לא זמינה כרגע — עוברים ל-{0}': ['Station unavailable — switching to {0}', 'Estación no disponible — cambiando a {0}'],
  'אף תחנת להיטים לא ענתה כרגע': ['No hits station answered right now', 'Ninguna estación de éxitos respondió ahora'],
  'הקישו על 📻 או על תחנה כדי להפעיל את הרדיו': ['Tap 📻 or a station to start the radio', 'Toca 📻 o una estación para encender la radio'],
  'הקישו על 📻 כדי להפעיל את הרדיו': ['Tap 📻 to start the radio', 'Toca 📻 para encender la radio'],
  'הפעלה / עצירה': ['Play / stop', 'Reproducir / detener'],
  'עוצמה': ['Volume', 'Volumen'], 'עוצמת הרדיו': ['Radio volume', 'Volumen de la radio'],
  'התחנה הקודמת': ['Previous station', 'Estación anterior'], 'התחנה הבאה': ['Next station', 'Estación siguiente'], 'תחנה אקראית': ['Random station', 'Estación al azar'],
  'נסו שוב': ['Try again', 'Intentar de nuevo'],
  'תחנות להיטים — שידור חי': ['Hits stations — live', 'Estaciones de éxitos — en vivo'],
  'תחנות להיטים': ['Hits stations', 'Estaciones de éxitos'],
  '(הקשה = ניגון כאן)': ['(tap = play here)', '(toca = reproducir aquí)'],
  'ברירת מחדל': ['default', 'predeterminada'],
  'מתחבר…': ['connecting…', 'conectando…'], 'מתחבר לשידור…': ['Connecting to the broadcast…', 'Conectando con la transmisión…'],
  'מנסה שוב…': ['retrying…', 'reintentando…'], 'מכוון…': ['tuning…', 'sintonizando…'],
  'שידור חי': ['Live', 'En vivo'], 'כבוי': ['off', 'apagada'], 'הרדיו כבוי': ['The radio is off', 'La radio está apagada'],
  'בחרו תחנה או לחצו ▶': ['Pick a station or press ▶', 'Elige una estación o pulsa ▶'],
  'כאן אין גישה לשידור חי, לכן מתנגן {0}.': ['Live radio is not reachable here — now playing: {0}.', 'Aquí no hay acceso a la radio en vivo — suena: {0}.'],
  'הרדיו מתחיל ב-WNCI 97.9 בהקשה הראשונה באתר · תחנה שלא עונה — מדלגים אוטומטית לתחנת הלהיטים הבאה · 🔊 בסרגל הכלים משתיק הכול.': ['The radio starts with WNCI 97.9 on your first tap · a station that does not answer is skipped automatically to the next hits station · 🔊 in the toolbar mutes everything.', 'La radio empieza con WNCI 97.9 con tu primer toque · si una estación no responde se pasa automáticamente a la siguiente de éxitos · 🔊 en la barra de herramientas silencia todo.'],
  'עצור רדיו · {0}': ['Stop radio · {0}', 'Detener radio · {0}'],
  'הפעל רדיו · WNCI 97.9': ['Play radio · WNCI 97.9', 'Encender radio · WNCI 97.9'],
  'כבה רדיו': ['Turn off radio', 'Apagar radio'], 'הדלק רדיו': ['Turn on radio', 'Encender radio'],
  'תחנה הבאה': ['Next station', 'Estación siguiente'], 'כוון ל-WNCI 97.9': ['Tune to WNCI 97.9', 'Sintonizar WNCI 97.9'],
  'סווינג ג׳אז': ['Swing jazz', 'Jazz swing'], 'דו-וופ ורוקנרול': ['Doo-wop & rock’n’roll', 'Doo-wop y rock and roll'], 'קאנטרי ובלוגראס': ['Country & bluegrass', 'Country y bluegrass'],
  'ביג-בנד, ויברפון וקונטרבס': ['Big band, vibraphone and double bass', 'Big band, vibráfono y contrabajo'], 'הרמוניות, פסנתר וסקסופון': ['Harmonies, piano and saxophone', 'Armonías, piano y saxofón'],
  'בנג׳ו, כינור ובס בום-צ׳יק': ['Banjo, fiddle and boom-chick bass', 'Banjo, violín y bajo boom-chick'], 'שאפל איטי, 12 תיבות, אורגן וגיטרה': ['Slow shuffle, 12 bars, organ and guitar', 'Shuffle lento, 12 compases, órgano y guitarra'],
  'מיתרים, צ׳לו ונבל': ['Strings, cello and harp', 'Cuerdas, chelo y arpa'], 'קשר מדומה, בלי מילים': ['Simulated chatter, no words', 'Comunicación simulada, sin palabras'],
  'רדיו WNCI 97.9': ['Radio WNCI 97.9', 'Radio WNCI 97.9'],
  'בלוז': ['Blues', 'Blues'], 'קלאסי ולאונג׳': ['Classical & lounge', 'Clásica y lounge'], 'קשר (מדומה)': ['Radio chatter (simulated)', 'Radiocomunicación (simulada)'],

  // ---- styles UI / gallery shared
  'סגנון השיפוץ': ['Renovation style', 'Estilo de remodelación'], 'סגנונות': ['Styles', 'Estilos'],
  'סגנון: {0}': ['Style: {0}', 'Estilo: {0}'], 'החלפת הסגנון נכשלה': ['Changing the style failed', 'No se pudo cambiar el estilo'],

  // ---- 3D interactions: doors, windows, cabinets, lights, curtains …
  'פתח דלת': ['Open door', 'Abrir puerta'], 'סגור דלת': ['Close door', 'Cerrar puerta'],
  'פתח חלון': ['Open window', 'Abrir ventana'], 'סגור חלון': ['Close window', 'Cerrar ventana'], 'חלון': ['Window', 'Ventana'],
  'פתח ארון': ['Open cabinet', 'Abrir gabinete'], 'סגור ארון': ['Close cabinet', 'Cerrar gabinete'], 'נעול': ['Locked', 'Bloqueado'],
  'פתח מגירה': ['Open drawer', 'Abrir cajón'], 'סגור מגירה': ['Close drawer', 'Cerrar cajón'],
  'הדלק מנורה': ['Turn on lamp', 'Encender lámpara'], 'כבה מנורה': ['Turn off lamp', 'Apagar lámpara'],
  'הדלק אור': ['Turn on light', 'Encender luz'], 'כבה אור': ['Turn off light', 'Apagar luz'],
  'סגור וילון': ['Close curtain', 'Cerrar cortina'], 'פתח וילון': ['Open curtain', 'Abrir cortina'],
  'הורד וילון': ['Lower shade', 'Bajar persiana'], 'הרם וילון': ['Raise shade', 'Subir persiana'],
  'פתח ארון בגדים': ['Open closet', 'Abrir clóset'], 'סגור ארון בגדים': ['Close closet', 'Cerrar clóset'],
  'פתח דלת מזנון': ['Open sideboard door', 'Abrir puerta del aparador'], 'סגור דלת מזנון': ['Close sideboard door', 'Cerrar puerta del aparador'],
  'הדלק מנורת רצפה': ['Turn on floor lamp', 'Encender lámpara de pie'], 'כבה מנורת רצפה': ['Turn off floor lamp', 'Apagar lámpara de pie'],
  'הדלק מנורת אוכל': ['Turn on dining light', 'Encender lámpara del comedor'], 'כבה מנורת אוכל': ['Turn off dining light', 'Apagar lámpara del comedor'],
  'סגור תיבת דואר': ['Close mailbox', 'Cerrar buzón'], 'פתח תיבת דואר': ['Open mailbox', 'Abrir buzón'],
  'כבה מזגן': ['Turn off A/C', 'Apagar aire acondicionado'], 'הפעל מזגן': ['Turn on A/C', 'Encender aire acondicionado'],
  // kitchen
  'פתח תנור': ['Open oven', 'Abrir horno'], 'סגור תנור': ['Close oven', 'Cerrar horno'],
  'כבה להבה {0}': ['Turn off burner {0}', 'Apagar quemador {0}'], 'הדלק להבה {0}': ['Light burner {0}', 'Encender quemador {0}'],
  'כבה אור בקולט': ['Turn off hood light', 'Apagar luz de la campana'], 'הדלק אור בקולט': ['Turn on hood light', 'Encender luz de la campana'],
  'פתח מקרר': ['Open fridge', 'Abrir refrigerador'], 'סגור מקרר': ['Close fridge', 'Cerrar refrigerador'],
  'פתח מקפיא': ['Open freezer', 'Abrir congelador'], 'סגור מקפיא': ['Close freezer', 'Cerrar congelador'],
  'סגור מדיח': ['Close dishwasher', 'Cerrar lavavajillas'], 'פתח מדיח': ['Open dishwasher', 'Abrir lavavajillas'],
  'פתח מיקרוגל': ['Open microwave', 'Abrir microondas'], 'סגור מיקרוגל': ['Close microwave', 'Cerrar microondas'],
  'סגור את דלת המיקרוגל': ['Close the microwave door', 'Cierra la puerta del microondas'], 'עצור מיקרוגל': ['Stop microwave', 'Detener microondas'],
  'הפעל מיקרוגל (30 שנ׳)': ['Start microwave (30 s)', 'Encender microondas (30 s)'],
  'מלפפון': ['cucumber', 'pepino'], 'גזר': ['carrot', 'zanahoria'], 'עגבנייה': ['tomato', 'jitomate'], 'בצל סגול': ['red onion', 'cebolla morada'], 'חסה': ['lettuce', 'lechuga'],
  'הירקות חתוכים — ערבב בקערה': ['The vegetables are cut — mix them in the bowl', 'Las verduras están cortadas — mézclalas en el tazón'],
  'חתוך {0}': ['Cut the {0}', 'Cortar {0}'], 'מערבב…': ['Mixing…', 'Mezclando…'], 'סלט חדש': ['New salad', 'Nueva ensalada'],
  'קערת סלט (חתוך ירקות על הקרש)': ['Salad bowl (cut vegetables on the board)', 'Tazón de ensalada (corta verduras en la tabla)'], 'ערבב סלט': ['Mix the salad', 'Mezclar la ensalada'],
  'הדלק מנורה מעל הכיור': ['Turn on light over the sink', 'Encender luz sobre el fregadero'], 'כבה מנורה מעל הכיור': ['Turn off light over the sink', 'Apagar luz sobre el fregadero'],
  // bathrooms
  'הרם מושב': ['Raise seat', 'Subir asiento'], 'הורד מושב': ['Lower seat', 'Bajar asiento'],
  'פתח מכסה אסלה': ['Open toilet lid', 'Abrir tapa del inodoro'], 'סגור מכסה אסלה': ['Close toilet lid', 'Cerrar tapa del inodoro'],
  'מוריד מים…': ['Flushing…', 'Jalando la cadena…'], 'הורד מים': ['Flush', 'Jalar la cadena'],
  'כבה מאוורר': ['Turn off fan', 'Apagar ventilador'], 'הפעל מאוורר': ['Turn on fan', 'Encender ventilador'],
  'פתח ארונית': ['Open vanity', 'Abrir mueble del lavabo'], 'סגור ארונית': ['Close vanity', 'Cerrar mueble del lavabo'],
  'פתח ארון מראה': ['Open mirror cabinet', 'Abrir botiquín con espejo'], 'סגור ארון מראה': ['Close mirror cabinet', 'Cerrar botiquín con espejo'],
  'הפעל מקלחת': ['Turn on shower', 'Abrir regadera'], 'סגור מקלחת': ['Turn off shower', 'Cerrar regadera'],
  'פתח מחיצת זכוכית': ['Open glass panel', 'Abrir mampara de vidrio'], 'סגור מחיצת זכוכית': ['Close glass panel', 'Cerrar mampara de vidrio'],
  'סגור דלת מקלחון': ['Close shower door', 'Cerrar puerta de la regadera'], 'פתח דלת מקלחון': ['Open shower door', 'Abrir puerta de la regadera'],
  'הפעל מקלחת גשם': ['Turn on rain shower', 'Abrir regadera de lluvia'],
  'פתח ברז': ['Turn on faucet', 'Abrir llave'], 'סגור ברז': ['Turn off faucet', 'Cerrar llave'],
  // basement
  'הכדורים מתגלגלים…': ['The balls are rolling…', 'Las bolas están rodando…'], 'שבירה': ['Break', 'Romper (saque)'], 'מכה': ['Shoot', 'Tirar'], 'סדר כדורים': ['Rack the balls', 'Acomodar las bolas'],
  'פתח דלת מייבש': ['Open dryer door', 'Abrir puerta de la secadora'], 'פתח דלת מכונת כביסה': ['Open washer door', 'Abrir puerta de la lavadora'],
  'מייבש': ['dryer', 'secadora'], 'מכונת כביסה': ['washer', 'lavadora'], 'סגור את הדלת': ['Close the door', 'Cierra la puerta'],
  'עצור {0}': ['Stop the {0}', 'Detener la {0}'], 'הפעל {0}': ['Start the {0}', 'Encender la {0}'], 'נעול בזמן פעולה': ['Locked while running', 'Bloqueada mientras funciona'],
  'פתח ארון כביסה': ['Open laundry cabinet', 'Abrir gabinete de lavandería'], 'סגור ארון כביסה': ['Close laundry cabinet', 'Cerrar gabinete de lavandería'],
  'פתח לוח חשמל': ['Open electrical panel', 'Abrir tablero eléctrico'], 'סגור לוח חשמל': ['Close electrical panel', 'Cerrar tablero eléctrico'],
  'כבה מסיר לחות': ['Turn off dehumidifier', 'Apagar deshumidificador'], 'הפעל מסיר לחות': ['Turn on dehumidifier', 'Encender deshumidificador'],

  // ---- TV
  'ערוץ הבית · מצגת השיפוץ': ['House channel · renovation slideshow', 'Canal de la casa · presentación de la remodelación'],
  'חדשות ABC': ['ABC News', 'Noticias ABC'], 'חדשות NBC': ['NBC News', 'Noticias NBC'], 'חדשות CBS': ['CBS News', 'Noticias CBS'],
  'שידורים חיים': ['Live coverage', 'Transmisiones en vivo'], 'חדשות ארה״ב': ['US news', 'Noticias de EE. UU.'], 'כלכלה ושווקים': ['Business & markets', 'Economía y mercados'],
  'מזג אוויר': ['Weather', 'Clima'], 'חלל · NASA Live': ['Space · NASA Live', 'Espacio · NASA Live'], 'חדשות קולומבוס (בזמן מהדורות)': ['Columbus news (during newscasts)', 'Noticias de Columbus (durante los noticieros)'],
  '3351 Eakin Rd — אחרי שיפוץ': ['3351 Eakin Rd — after renovation', '3351 Eakin Rd — después de la remodelación'],
  'Cape Cod 1956 — שיפוץ יוקרה מלא': ['Cape Cod 1956 — full luxury renovation', 'Cape Cod 1956 — remodelación de lujo completa'],
  'מטבח ירוק עמוק ושיש קלקטה': ['Deep-green kitchen and Calacatta marble', 'Cocina verde profundo y mármol Calacatta'],
  'פליז מוברש · מקרר משולב · כיריים מקצועיות': ['Brushed brass · panelled fridge · pro range', 'Latón cepillado · refrigerador integrado · estufa profesional'],
  'מרתף בילוי': ['Entertainment basement', 'Sótano de entretenimiento'], 'ביליארד · בר · כביסה': ['Billiards · bar · laundry', 'Billar · bar · lavandería'],
  'הצג על הטלוויזיה': ['Show on the TV', 'Mostrar en la TV'], 'כבה ✕': ['Off ✕', 'Apagar ✕'], 'שלט טלוויזיה': ['TV remote', 'Control de la TV'],
  'טלוויזיה': ['TV', 'TV'], 'הפעלה / כיבוי': ['Power on / off', 'Encender / apagar'], 'ערוץ קודם': ['Previous channel', 'Canal anterior'], 'ערוץ הבא': ['Next channel', 'Canal siguiente'],
  'הנמך': ['Volume down', 'Bajar volumen'], 'הגבר': ['Volume up', 'Subir volumen'], 'השתק': ['Mute', 'Silenciar'],
  'שידורים חיים רשמיים וחינמיים מ-YouTube. אם ערוץ לא משדר כרגע — נסו ערוץ אחר.': ['Official, free live streams from YouTube. If a channel is not live right now — try another one.', 'Transmisiones en vivo oficiales y gratuitas de YouTube. Si un canal no está en vivo ahora — prueba otro.'],
  'טוען שידור חי…': ['Loading the live stream…', 'Cargando la transmisión en vivo…'],
  'שידור חי זמין באתר': ['Live streams work on the website', 'Las transmisiones en vivo funcionan en el sitio'],
  'מנגן בנגן שעל המסך': ['Playing in the on-screen player', 'Reproduciendo en el reproductor en pantalla'],
  'משודר': ['On air', 'Al aire'], 'כבויה': ['off', 'apagada'], 'נגן גדול ▶': ['Big player ▶', 'Reproductor grande ▶'], 'נגן גדול': ['Big player', 'Reproductor grande'],
  'ערוצי טלוויזיה · {0}': ['TV channels · {0}', 'Canales de TV · {0}'], 'הדלק טלוויזיה · ערוצים': ['Turn on TV · channels', 'Encender TV · canales'],
  'שלט טלוויזיה · {0}': ['TV remote · {0}', 'Control de la TV · {0}'], 'שלט טלוויזיה · ערוצים חיים': ['TV remote · live channels', 'Control de la TV · canales en vivo'],
  'ערוצים': ['channels', 'canales'], 'ערוצים חיים': ['live channels', 'canales en vivo'],
  'פתח ב-YouTube': ['Open on YouTube', 'Abrir en YouTube'],
};

// help panel body per language (the Hebrew one is the page's own markup)
export const HELP = {
  title: { en: 'How to tour the house', es: 'Cómo recorrer la casa' },
  en: `
    <h3>3D walk — computer</h3>
    <ul>
      <li>Drag on the screen to look around (in free mode, click to lock the mouse; <kbd>Esc</kbd> releases it).</li>
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>←</kbd><kbd>→</kbd> to turn, <kbd>Shift</kbd> to walk faster.</li>
      <li><kbd>E</kbd> or click — act on what is in the middle of the screen: open doors, drawers and cabinets, switch lights, run faucets, the radio and the TV.</li>
      <li><kbd>Q</kbd> / <kbd>F</kbd> — flashlight (handy in the basement). Wheel / trackpad pinch — zoom.</li>
    </ul>
    <h3>3D walk — phone</h3>
    <ul>
      <li>Arrows in the bottom corner: ▲ forward, ▼ back, ◀ ▶ turn. Press and hold = continuous, gently accelerating movement; a tap = one short step.</li>
      <li>Drag on the screen to look, pinch with two fingers to zoom, double-tap the floor = walk there.</li>
      <li>Tap an object, or press the "Action" button. The ⋯ button opens the tools.</li>
    </ul>
    <h3>Modes</h3>
    <ul>
      <li><b>360° tour</b> — stand at fixed spots, drag to look, arrows on the floor move between spots, download a panorama.</li>
      <li><b>✨ Photoreal render</b> (in 360° mode) — a path-traced render of the whole surroundings; look around in the result and download a PNG. <b>📷 Render the current view</b> — a high-resolution image of what you see.</li>
      <li><b>Room bar</b> (bottom of the screen while walking) — tap a room and you walk there on your own (doors open, stairs included); tap it again or move to stop. <b>🚘 Limousine</b> takes you to the limousine waiting at the curb — tap its door to get in; <b>⟵ Back home</b> returns to the house.</li>
      <li><b>🖼 Renders</b> (in the ⋯ menu / the tools column) — ready-made 360° renders of every renovation style; they open in the room you are in and in the current style. Swipe sideways or use ‹ › for another room; "✓ Apply this style in the tour" switches the style and returns you to exactly the same spot.</li>
      <li><b>Scan / dollhouse</b> — a rotating "dollhouse" view; filter by floor; double-click a floor to go in.</li>
      <li><b>Floor plan</b> — a top view; drag to pan, wheel to zoom, tap a room to enter it.</li>
    </ul>
    <h3>Tools</h3>
    <ul>
      <li><b>🇮🇱 / 🇺🇸 / 🇲🇽 Language</b> — Hebrew, English or Spanish.</li>
      <li><b>Day / evening / night</b> — at night the lights in the house switch on automatically; the wall switches still work.</li>
      <li><b>📻 Hits radio</b> — on your first tap the live broadcast of WNCI 97.9 FM Columbus, Ohio starts. Tap the 📻 chip for play / stop, volume and the list of US hits stations (Top 40). A station that does not answer is skipped to the next one automatically.</li>
      <li><b>📺 TV</b> — tap the remote on the coffee table or the screen for live US channels.</li>
      <li><b>🎨 Renovation style</b> (also the 🎨 Style button in the row under the top bar) — switch the renovation options (materials and colours) live, even while walking or in 360°.</li>
      <li><b>⟲ Start over</b> — back to the very beginning (refreshing the page does the same).</li>
      <li><b>The small map</b> — tap it to enlarge it for a moment.</li>
      <li><b>📏 Measure</b> — mark two points to get the distance in metres and feet-inches. <kbd>Esc</kbd> clears.</li>
      <li>Shortcuts: <kbd>1</kbd> walk · <kbd>2</kbd> 360° · <kbd>3</kbd> dollhouse · <kbd>4</kbd> plan · <kbd>M</kbd> measure.</li>
      <li>Closing windows: <b>✕</b> at the top, a tap outside the window, or <kbd>Esc</kbd>.</li>
    </ul>`,
  es: `
    <h3>Caminar en 3D — computadora</h3>
    <ul>
      <li>Arrastra en la pantalla para mirar (en modo libre, haz clic para bloquear el ratón; <kbd>Esc</kbd> lo libera).</li>
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o <kbd>↑</kbd><kbd>↓</kbd> para moverte, <kbd>←</kbd><kbd>→</kbd> para girar, <kbd>Shift</kbd> para caminar más rápido.</li>
      <li><kbd>E</kbd> o clic — actúa sobre lo que está en el centro de la pantalla: abrir puertas, cajones y gabinetes, encender luces, abrir llaves, la radio y la TV.</li>
      <li><kbd>Q</kbd> / <kbd>F</kbd> — linterna (útil en el sótano). Rueda / pellizco en el touchpad — zoom.</li>
    </ul>
    <h3>Caminar en 3D — teléfono</h3>
    <ul>
      <li>Flechas en la esquina inferior: ▲ adelante, ▼ atrás, ◀ ▶ girar. Mantener presionado = movimiento continuo que acelera suavemente; un toque = un paso corto.</li>
      <li>Arrastra en la pantalla para mirar, pellizca con dos dedos para hacer zoom, doble toque en el piso = caminar hasta ahí.</li>
      <li>Toca un objeto o pulsa el botón "Acción". El botón ⋯ abre las herramientas.</li>
    </ul>
    <h3>Modos</h3>
    <ul>
      <li><b>Recorrido 360°</b> — puntos fijos, arrastra para mirar, flechas en el piso para pasar de un punto a otro, descarga de panorámica.</li>
      <li><b>✨ Render fotorrealista</b> (en modo 360°) — render con trazado de rayos de todo el entorno; puedes mirar alrededor y descargar un PNG. <b>📷 Render de la vista actual</b> — imagen en alta resolución de lo que ves.</li>
      <li><b>Barra de estancias</b> (abajo, al caminar) — toca una estancia y caminas hasta allí solo (las puertas se abren, escaleras incluidas); tócala de nuevo o muévete para parar. <b>🚘 Limusina</b> te lleva a la limusina que espera junto a la acera — toca su puerta para subir; <b>⟵ Volver a casa</b> regresa a la casa.</li>
      <li><b>🖼 Renders</b> (en el menú ⋯ / la columna de herramientas) — renders 360° listos de todos los estilos de remodelación; se abren en la estancia donde estás y en el estilo actual. Desliza de lado o usa ‹ › para otra estancia; "✓ Aplicar este estilo en el recorrido" cambia el estilo y te devuelve exactamente al mismo punto.</li>
      <li><b>Escaneo / casa de muñecas</b> — vista giratoria tipo maqueta; filtro por planta; doble clic en un piso para entrar.</li>
      <li><b>Plano de planta</b> — vista desde arriba; arrastra para desplazar, rueda para zoom, toca una habitación para entrar.</li>
    </ul>
    <h3>Herramientas</h3>
    <ul>
      <li><b>🇮🇱 / 🇺🇸 / 🇲🇽 Idioma</b> — hebreo, inglés o español.</li>
      <li><b>Día / tarde / noche</b> — de noche las luces de la casa se encienden solas; los apagadores siguen funcionando.</li>
      <li><b>📻 Radio de éxitos</b> — con tu primer toque empieza la transmisión en vivo de WNCI 97.9 FM de Columbus, Ohio. Toca el chip 📻 para reproducir / detener, el volumen y la lista de estaciones de éxitos de EE. UU. (Top 40). Si una estación no responde, se pasa sola a la siguiente.</li>
      <li><b>📺 TV</b> — toca el control remoto en la mesa de centro o la pantalla para ver canales en vivo de EE. UU.</li>
      <li><b>🎨 Estilo de remodelación</b> (también el botón 🎨 Estilo en la fila bajo la barra superior) — cambia las opciones de remodelación (materiales y colores) en tiempo real, también caminando o en 360°.</li>
      <li><b>⟲ Empezar de nuevo</b> — vuelve al inicio (recargar la página hace lo mismo).</li>
      <li><b>El mapa pequeño</b> — tócalo para ampliarlo un momento.</li>
      <li><b>📏 Medir</b> — marca dos puntos para obtener la distancia en metros y pies-pulgadas. <kbd>Esc</kbd> borra.</li>
      <li>Atajos: <kbd>1</kbd> caminar · <kbd>2</kbd> 360° · <kbd>3</kbd> maqueta · <kbd>4</kbd> plano · <kbd>M</kbd> medir.</li>
      <li>Cerrar ventanas: <b>✕</b> arriba, un toque fuera de la ventana o <kbd>Esc</kbd>.</li>
    </ul>`,
};

// element-keyed strings (split words in the mode bar etc.): data-i18n="key"
export const KEYED = {
  'mode.walk': { he: 'הליכה', en: 'Walk', es: 'Caminar' },
  'mode.walk.long': { he: ' 3D', en: ' 3D', es: ' 3D' },
  'mode.doll.long': { he: 'סריקה / ', en: 'Scan / ', es: 'Escaneo / ' },
  'mode.doll': { he: 'דולהאוס', en: 'Dollhouse', es: 'Maqueta' },
  'mode.plan': { he: 'תוכנית', en: 'Floor', es: 'Plano' },
  'mode.plan.long': { he: ' קומה', en: ' plan', es: ' de planta' },
};

/* ============================================================================================ engine */
const st = { lang: 'he', started: false, observer: null, subs: new Set(), missing: new Set(), extra: new Map(), patterns: null, gen: 0 };
const srcText = new WeakMap(); // Text node → { src, out }
const srcAttr = new WeakMap(); // Element → { [attr]: { src, out } }
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

export function getLang() { return st.lang; }
export const lang = getLang;
export function langInfo(id) { return LANGS.find((l) => l.id === (id || st.lang)) || LANGS[0]; }

// register extra pairs (style strings, gallery strings, channel names …)
export function register(he, en, es) { if (he && HEB.test(he) && !DICT[he]) st.extra.set(he, [en || he, es || en || he]); st.patterns = null; }
export function registerTable(he, en, es) {
  if (!he || typeof he !== 'object') return;
  for (const k of Object.keys(he)) {
    const a = he[k], b = en && en[k], c = es && es[k];
    if (typeof a === 'string') register(a, typeof b === 'string' ? b : '', typeof c === 'string' ? c : '');
    else if (a && typeof a === 'object') registerTable(a, b, c);
  }
}

// V10: other modules (limo / casino worlds) bring their own dictionaries and merge them here:
//   extend({ he: {key: 'עברית', …}, en: {key: 'English', …}, es: {key: 'Español', …} })   (parallel tables, nested ok)
//   extend({ 'עברית {0}': ['English {0}', 'Español {0}'], … })                            (he → [en, es] pairs)
// Hebrew keys already in DICT keep the DICT text. Text already on screen is re-translated (and canvas listeners
// are notified) so a dictionary loaded late still applies.
export function extend(tables) {
  if (!tables || typeof tables !== 'object') return 0;
  const before = st.extra.size;
  if (tables.he && typeof tables.he === 'object' && !Array.isArray(tables.he)) registerTable(tables.he, tables.en, tables.es);
  else for (const k of Object.keys(tables)) { const v = tables[k]; if (Array.isArray(v)) register(k, v[0], v[1]); }
  st.patterns = null; st.gen++;
  for (const k of [...st.missing]) if (DICT[k] || st.extra.has(k)) st.missing.delete(k);
  if (typeof document !== 'undefined' && st.started && st.lang !== 'he') {
    translateDom(document.body);
    for (const f of st.subs) { try { f(st.lang); } catch (e) { console.warn('[i18n] listener', e); } }
  }
  return st.extra.size - before;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compile() {
  const out = [];
  const add = (k, v) => {
    if (k.indexOf('{0}') < 0) return;
    const parts = k.split(/(\{\d\})/), idx = [];
    let re = '^';
    for (const p of parts) { const m = /^\{(\d)\}$/.exec(p); if (m) { idx.push(+m[1]); re += '(.+?)'; } else re += esc(p); }
    out.push({ re: new RegExp(re + '$', 's'), idx, v, len: k.length });
  };
  for (const k of Object.keys(DICT)) add(k, DICT[k]);
  for (const [k, v] of st.extra) add(k, v);
  out.sort((a, b) => b.len - a.len);
  st.patterns = out;
}
const fill = (tpl, args) => tpl.replace(/\{(\d)\}/g, (_, i) => (args[+i] != null ? String(args[+i]) : ''));
function lookup(s, L) { const e = DICT[s] || st.extra.get(s); return e ? e[COL[L]] : null; }

// translate ANY string (composed or not) into language L (default: current)
export function tr(s, L) {
  L = L || st.lang;
  if (s == null) return s;
  s = String(s);
  if (L === 'he' || !HEB.test(s)) return s;
  const r = trInner(s, L, 0);
  if (r == null) { st.missing.add(s); return s; }
  return r;
}
const DECOR = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}…]*)$/u;
const SEPS = ['\n', ' — ', ' – ', ' · ', ' | ', ': ', ' / ', ', ', ' ('];
function trInner(s, L, depth) {
  if (!HEB.test(s)) return s;
  if (depth > 6) return null;
  let v = lookup(s, L); if (v != null) return v;
  const m = DECOR.exec(s);
  if (m && (m[1] || m[3])) {
    if (m[2] && HEB.test(m[2])) { const w = trInner(m[2], L, depth + 1); if (w != null) return m[1] + w + m[3]; }
  }
  if (!st.patterns) compile();
  for (const p of st.patterns) {
    const mm = p.re.exec(s); if (!mm) continue;
    const args = [];
    let okAll = true;
    for (let i = 0; i < p.idx.length; i++) { const g = mm[i + 1]; const t = HEB.test(g) ? trInner(g, L, depth + 1) : g; if (t == null) { okAll = false; break; } args[p.idx[i]] = t; }
    if (okAll) return fill(p.v[COL[L]], args);
  }
  for (const sep of SEPS) {
    if (s.indexOf(sep) < 0) continue;
    const parts = sep === ' (' ? [s.slice(0, s.indexOf(sep)), s.slice(s.indexOf(sep) + 1)] : s.split(sep);
    const out = [];
    let okAll = true;
    for (const p of parts) { const t = trInner(p, L, depth + 1); if (t == null) { okAll = false; break; } out.push(t); }
    if (okAll) return out.join(sep === ' (' ? ' ' : sep);
  }
  return null;
}
// t('hebrew {0}', arg…) — template translate (args are translated too when Hebrew)
export function t(he, ...args) {
  if (st.lang === 'he') return args.length ? fill(he, args) : he;
  const e = lookup(he, st.lang);
  if (e != null) return args.length ? fill(e, args.map((a) => tr(a))) : e;
  return tr(args.length ? fill(he, args) : he);
}

/* ---------------------------------------------------------------- DOM translator */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'TEXTAREA', 'SVG', 'svg']);
function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || (e.hasAttribute && e.hasAttribute('data-i18n-skip'))) return true;
  }
  return false;
}
function doText(n) {
  const cur = n.data, p = n.parentElement;
  let rec = srcText.get(n);
  if (rec && cur === rec.out && rec.lang === st.lang && rec.gen === st.gen) return; // up to date
  const keyed = !!(p && p.hasAttribute('data-i18n'));
  if (!rec || (cur !== rec.out && cur !== rec.src)) { // new content written by the page
    if (!HEB.test(cur) && !keyed) { if (rec) srcText.delete(n); return; }
    rec = { src: cur, out: cur, lang: 'he' }; srcText.set(n, rec);
  }
  if (!p || skipped(p)) return;
  let out;
  const key = keyed ? p.getAttribute('data-i18n') : '';
  if (key && KEYED[key]) out = KEYED[key][st.lang] != null ? KEYED[key][st.lang] : rec.src;
  else out = st.lang === 'he' ? rec.src : keepSpace(rec.src, (x) => tr(x));
  rec.out = out; rec.lang = st.lang; rec.gen = st.gen;
  if (n.data !== out) n.data = out;
}
function keepSpace(s, f) { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return m[1] + f(m[2]) + m[3]; }
function doAttr(el, a) {
  const cur = el.getAttribute(a); if (cur == null) return;
  let recs = srcAttr.get(el); let rec = recs && recs[a];
  if (rec && cur === rec.out && rec.lang === st.lang && rec.gen === st.gen) return;
  if (!rec || (cur !== rec.out && cur !== rec.src)) {
    if (!HEB.test(cur)) { if (rec) delete recs[a]; return; }
    if (!recs) { recs = {}; srcAttr.set(el, recs); }
    rec = recs[a] = { src: cur, out: cur, lang: 'he' };
  }
  const out = st.lang === 'he' ? rec.src : tr(rec.src);
  rec.out = out; rec.lang = st.lang; rec.gen = st.gen;
  if (cur !== out) el.setAttribute(a, out);
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const top = root.nodeType === 1 ? root : null;
  if (top && skipped(top)) return;
  if (top) for (const a of ATTRS) if (top.hasAttribute(a)) doAttr(top, a);
  const tw = document.createTreeWalker(root, 5 /* SHOW_ELEMENT | SHOW_TEXT */, {
    acceptNode(n) { if (n.nodeType === 1 && (SKIP_TAGS.has(n.tagName) || n.hasAttribute('data-i18n-skip'))) return 2; /* REJECT subtree */ return 1; },
  });
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) doText(n);
    else for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
  }
}
export function translateDom(root) { if (typeof document === 'undefined') return; try { walk(root || document.body); } catch (e) { console.warn('[i18n] dom', e); } }
function observe() {
  if (st.observer || typeof MutationObserver === 'undefined' || !document.body) return;
  st.observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') { if (m.target.nodeType === 3) doText(m.target); }
      else if (m.type === 'attributes') { if (m.target.nodeType === 1 && !skipped(m.target)) doAttr(m.target, m.attributeName); }
      else for (const n of m.addedNodes) walk(n);
    }
  });
  st.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/* ---------------------------------------------------------------- document-level bits */
let helpHe = null, helpTitleHe = null;
function applyDocument() {
  const L = langInfo();
  const html = document.documentElement;
  html.lang = L.html; html.dir = L.dir;
  document.body && document.body.classList.toggle('ltr', L.dir === 'ltr');
  document.title = tr('3351 Eakin Rd — סיור 3D');
  const md = document.querySelector('meta[name="description"]');
  if (md) { if (!md.dataset.he) md.dataset.he = md.getAttribute('content'); md.setAttribute('content', tr(md.dataset.he)); }
  // help panel body: whole blocks per language
  const body = document.querySelector('#help .ph-body'), ttl = document.getElementById('helpTitle');
  if (body) {
    if (helpHe == null) { helpHe = body.innerHTML; body.setAttribute('data-i18n-skip', ''); }
    body.innerHTML = st.lang === 'he' ? helpHe : HELP[st.lang];
  }
  if (ttl) {
    if (helpTitleHe == null) { helpTitleHe = ttl.textContent; ttl.setAttribute('data-i18n-skip', ''); }
    ttl.textContent = st.lang === 'he' ? helpTitleHe : HELP.title[st.lang];
  }
  for (const sw of document.querySelectorAll('.lang-sw')) syncSwitcher(sw);
}

/* ---------------------------------------------------------------- switcher UI */
function syncSwitcher(sw) {
  for (const b of sw.querySelectorAll('button[data-lang]')) {
    const on = b.dataset.lang === st.lang;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
// a row of 3 buttons "🇮🇱 עברית · 🇺🇸 English · 🇲🇽 Español" (each language always in its own name)
export function mountSwitcher(container, opts = {}) {
  if (!container || typeof document === 'undefined') return null;
  const sw = document.createElement('div');
  sw.className = 'lang-sw' + (opts.className ? ' ' + opts.className : '');
  sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'בחירת שפה');
  sw.setAttribute('dir', 'ltr');
  for (const L of LANGS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.lang = L.id; b.setAttribute('lang', L.html); b.setAttribute('data-i18n-skip', ''); // each language in its own name
    b.innerHTML = `<span class="fl" aria-hidden="true">${L.flag}</span><span class="ln">${L.name}</span>`;
    b.title = L.name;
    b.addEventListener('click', (e) => { e.stopPropagation(); setLang(L.id, { save: true }); });
    sw.appendChild(b);
  }
  if (opts.prepend) container.insertBefore(sw, container.firstChild); else container.appendChild(sw);
  syncSwitcher(sw);
  return sw;
}

/* ---------------------------------------------------------------- language selection */
function detect() {
  try { const q = new URLSearchParams(location.search).get('lang'); if (q && LANGS.some((l) => l.id === q)) return q; } catch (_) {}
  try { const s = localStorage.getItem(LS); if (s && LANGS.some((l) => l.id === s)) return s; } catch (_) {}
  let nav = '';
  try { nav = String((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase(); } catch (_) { nav = ''; }
  if (/^es\b|^es-/.test(nav)) return 'es';
  if (/^(he|iw)\b|^(he|iw)-/.test(nav)) return 'he';
  return nav ? 'en' : 'he';
}
export function onLangChange(fn) { if (typeof fn === 'function') st.subs.add(fn); return () => st.subs.delete(fn); }
export function setLang(id, o = {}) {
  if (!LANGS.some((l) => l.id === id)) id = 'he';
  const changed = id !== st.lang;
  st.lang = id;
  if (o.save) { try { localStorage.setItem(LS, id); } catch (_) {} }
  if (typeof document === 'undefined') return id;
  applyDocument();
  translateDom(document.body);
  if (changed || o.force) for (const f of st.subs) { try { f(id); } catch (e) { console.warn('[i18n] listener', e); } }
  try { window.dispatchEvent(new CustomEvent('tour:lang', { detail: { lang: id } })); } catch (_) {}
  return id;
}
export function initI18n() {
  if (st.started || typeof document === 'undefined') return api;
  st.started = true;
  try { window.__i18n = api; } catch (_) {}
  st.lang = detect();
  applyDocument();
  translateDom(document.body);
  observe();
  return api;
}
export const api = {
  LANGS, DICT, HELP, t, tr, setLang, getLang, onLangChange, register, registerTable, extend, mountSwitcher, translateDom, initI18n,
  get lang() { return st.lang; }, get missing() { return [...st.missing]; }, clearMissing() { st.missing.clear(); },
  get size() { return Object.keys(DICT).length + st.extra.size; },
};
