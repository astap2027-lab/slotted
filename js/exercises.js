// The exercise library: every exercise with its equipment, movement, tracking type and the
// detailed muscles it works (primary, secondary, stabilising), plus search, alternatives and
// the user's own exercises. Stable ids: built-in ids never change once shipped; custom ones start "u_".

// ---------- muscles ----------
// Groups match the regions on the body map. Detailed muscles roll up into one group each.
export const MUSCLE_GROUPS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Core', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', hips: 'Hips', shins: 'Shins',
};
const M = (label, group) => ({ label, group });
export const MUSCLE_INFO = {
  chest_upper: M('Upper chest', 'chest'), chest_mid: M('Mid chest', 'chest'), chest_lower: M('Lower chest', 'chest'),
  lats: M('Latissimus dorsi', 'back'), traps: M('Trapezius', 'back'), rhomboids: M('Rhomboids', 'back'), erectors: M('Spinal erectors', 'back'),
  delt_front: M('Front delts', 'shoulders'), delt_side: M('Side delts', 'shoulders'), delt_rear: M('Rear delts', 'shoulders'),
  biceps: M('Biceps brachii', 'biceps'), brachialis: M('Brachialis', 'biceps'),
  tri_long: M('Triceps, long head', 'triceps'), tri_lateral: M('Triceps, lateral head', 'triceps'), tri_medial: M('Triceps, medial head', 'triceps'),
  forearm_flex: M('Forearm flexors', 'forearms'), forearm_ext: M('Forearm extensors', 'forearms'), brachioradialis: M('Brachioradialis', 'forearms'),
  rectus_abdominis: M('Rectus abdominis', 'core'), obliques: M('Obliques', 'core'), transverse_abdominis: M('Transverse abdominis', 'core'), quadratus_lumborum: M('Quadratus lumborum', 'core'),
  rectus_femoris: M('Rectus femoris', 'quads'), vastus_lat: M('Vastus lateralis', 'quads'), vastus_med: M('Vastus medialis', 'quads'), vastus_int: M('Vastus intermedius', 'quads'),
  biceps_femoris: M('Biceps femoris', 'hamstrings'), semitendinosus: M('Semitendinosus', 'hamstrings'), semimembranosus: M('Semimembranosus', 'hamstrings'),
  glute_max: M('Gluteus maximus', 'glutes'), glute_med: M('Gluteus medius', 'glutes'), glute_min: M('Gluteus minimus', 'glutes'),
  gastrocnemius: M('Gastrocnemius', 'calves'), soleus: M('Soleus', 'calves'),
  hip_flexors: M('Hip flexors', 'hips'), adductors: M('Adductors', 'hips'), abductors: M('Abductors', 'hips'),
  tibialis: M('Tibialis anterior', 'shins'),
};
// How much one set loads a muscle, by its role. Individual mappings can override with "muscle:weight".
export const ROLE_WEIGHT = { primary: 1, secondary: 0.5, stabiliser: 0.2 };
const BUNDLES = {
  CH: 'chest_upper chest_mid chest_lower', QD: 'rectus_femoris vastus_lat vastus_med vastus_int',
  HM: 'biceps_femoris semitendinosus semimembranosus', TRI: 'tri_long tri_lateral tri_medial', CF: 'gastrocnemius soleus',
  FA: 'forearm_flex forearm_ext', AB: 'rectus_abdominis transverse_abdominis', CORE: 'rectus_abdominis obliques transverse_abdominis',
  GLM: 'glute_med glute_min', BICEPS: 'biceps brachialis',
};

// ---------- tracking ----------
export const TRACKS = {
  reps: { label: 'Reps', fields: ['reps'] },
  weight_reps: { label: 'Weight and reps', fields: ['kg', 'reps'] },
  duration: { label: 'Time', fields: ['sec'] },
  weight_duration: { label: 'Weight and time', fields: ['kg', 'sec'] },
  distance_duration: { label: 'Distance and time', fields: ['m', 'sec'] },
  weight_distance: { label: 'Weight and distance', fields: ['kg', 'm'] },
};
const TRACK_CODE = { r: 'reps', wr: 'weight_reps', d: 'duration', wd: 'weight_duration', dd: 'distance_duration', wm: 'weight_distance' };
// What the weight box means for this exercise.
export const LOADS = {
  total: 'Total weight', pair: 'Weight in each hand', single: 'Weight of the one implement',
  added: 'Weight added to your bodyweight', assisted: 'Assistance from the machine or band', none: 'Bodyweight only',
};
const LOAD_CODE = { t: 'total', p: 'pair', s: 'single', a: 'added', x: 'assisted', b: 'none' };
export const EQUIPMENT = {
  barbell: 'Barbell', dumbbell: 'Dumbbells', cable: 'Cable', machine: 'Machine', bodyweight: 'Bodyweight', band: 'Band',
  kettlebell: 'Kettlebell', ezbar: 'EZ bar', smith: 'Smith machine', trapbar: 'Trap bar', sled: 'Sled', other: 'Other',
};
export const CATEGORIES = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads',
  hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core', forearms: 'Forearms and grip', functional: 'Functional',
};
// Kit available with each equipment setting.
const KIT = {
  gym: null,
  home: new Set(['dumbbell', 'bodyweight', 'band', 'kettlebell']),
  bodyweight: new Set(['bodyweight']),
};
export const equipmentFits = (ex, setting) => !KIT[setting] || KIT[setting].has(ex.equipment);

// ---------- the catalogue ----------
// [id, name, other names, equipment, category, movement, c(ompound)/i(solation), tracking, load, primary, secondary, stabilisers, cue]
const ROWS = [
  // Chest
  ['bench-press', 'Bench press', 'barbell bench press|flat bench|bench|bp|flat barbell bench press', 'barbell', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_mid chest_lower', 'chest_upper:0.6 delt_front TRI', 'lats rhomboids', 'Feet planted, shoulder blades pinned, lower the bar to mid-chest and press up.'],
  ['incline-bench-press', 'Incline bench press', 'incline barbell bench press|incline bench', 'barbell', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_upper', 'chest_mid delt_front TRI', 'rhomboids', 'Bench at 30 to 45 degrees; lower to the upper chest.'],
  ['decline-bench-press', 'Decline bench press', 'decline barbell bench press|decline bench', 'barbell', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_lower chest_mid', 'TRI delt_front:0.3', '', 'Hook your legs in, lower to the lower chest, press back up.'],
  ['close-grip-bench-press', 'Close-grip bench press', 'cgbp|close grip bench', 'barbell', 'triceps', 'Horizontal push', 'c', 'wr', 't', 'TRI', 'chest_mid chest_lower delt_front', '', 'Hands shoulder-width, elbows tucked, touch the lower chest.'],
  ['floor-press', 'Floor press', 'barbell floor press', 'barbell', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_mid TRI', 'delt_front chest_lower', '', 'Lie on the floor; lower until the upper arms touch, pause, press.'],
  ['smith-bench-press', 'Smith machine bench press', 'smith bench', 'smith', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_mid chest_lower', 'chest_upper:0.6 delt_front TRI', '', 'Set the bench so the bar lands on mid-chest.'],
  ['dumbbell-bench-press', 'Dumbbell bench press', 'db bench press|dumbbell press|db press|flat dumbbell press', 'dumbbell', 'chest', 'Horizontal push', 'c', 'wr', 'p', 'chest_mid chest_lower', 'chest_upper:0.6 delt_front TRI', 'rhomboids', 'Lower the dumbbells to chest level with elbows about 45 degrees out.'],
  ['incline-dumbbell-press', 'Incline dumbbell press', 'incline db press|incline dumbbell bench press', 'dumbbell', 'chest', 'Horizontal push', 'c', 'wr', 'p', 'chest_upper', 'chest_mid delt_front TRI', '', 'Bench at 30 to 45 degrees; press up and slightly in.'],
  ['decline-dumbbell-press', 'Decline dumbbell press', 'decline db press', 'dumbbell', 'chest', 'Horizontal push', 'c', 'wr', 'p', 'chest_lower chest_mid', 'TRI delt_front:0.3', '', 'Lower to the bottom of the chest and press up.'],
  ['dumbbell-floor-press', 'Dumbbell floor press', 'db floor press', 'dumbbell', 'chest', 'Horizontal push', 'c', 'wr', 'p', 'chest_mid TRI', 'delt_front', '', 'Lie on the floor and press; upper arms touch down each rep.'],
  ['machine-chest-press', 'Machine chest press', 'chest press|seated chest press', 'machine', 'chest', 'Horizontal push', 'c', 'wr', 't', 'chest_mid chest_lower', 'chest_upper:0.6 delt_front TRI', '', 'Handles at mid-chest height; press without locking out hard.'],
  ['dumbbell-fly', 'Dumbbell fly', 'chest fly|db fly|dumbbell flye|flyes|chest flye', 'dumbbell', 'chest', 'Fly', 'i', 'wr', 'p', 'chest_mid chest_lower', 'chest_upper delt_front:0.3', 'biceps:0.2', 'Soft bend in the elbows; open wide until you feel a stretch, then hug back up.'],
  ['incline-dumbbell-fly', 'Incline dumbbell fly', 'incline fly', 'dumbbell', 'chest', 'Fly', 'i', 'wr', 'p', 'chest_upper', 'chest_mid delt_front:0.3', '', 'Same as a fly on a 30-degree incline.'],
  ['cable-fly', 'Cable fly', 'cable crossover|cable flye|crossover|standing cable fly', 'cable', 'chest', 'Fly', 'i', 'wr', 't', 'chest_mid chest_lower', 'chest_upper delt_front:0.3', 'CORE:0.4', 'Step forward, slight elbow bend, bring the handles together in front of you.'],
  ['low-to-high-cable-fly', 'Low-to-high cable fly', 'low cable fly|upward cable fly', 'cable', 'chest', 'Fly', 'i', 'wr', 't', 'chest_upper', 'chest_mid delt_front:0.4', '', 'Pulleys low; sweep the handles up to chin height.'],
  ['high-to-low-cable-fly', 'High-to-low cable fly', 'high cable fly|downward cable fly', 'cable', 'chest', 'Fly', 'i', 'wr', 't', 'chest_lower', 'chest_mid', '', 'Pulleys high; sweep down to hip height.'],
  ['pec-deck', 'Pec deck', 'machine fly|pec fly|butterfly', 'machine', 'chest', 'Fly', 'i', 'wr', 't', 'chest_mid chest_lower', 'chest_upper delt_front:0.3', '', 'Seat so the handles are at chest height; squeeze together.'],
  ['push-up', 'Push-up', 'pushup|press-up|push up|press up', 'bodyweight', 'chest', 'Horizontal push', 'c', 'r', 'b', 'chest_mid chest_lower', 'chest_upper delt_front TRI', 'AB', 'Straight line from head to heels; chest to just above the floor.'],
  ['weighted-push-up', 'Weighted push-up', 'weighted pushup|plate push-up', 'bodyweight', 'chest', 'Horizontal push', 'c', 'wr', 'a', 'chest_mid chest_lower', 'chest_upper delt_front TRI', 'AB', 'Plate on your upper back; same form as a push-up.'],
  ['incline-push-up', 'Incline push-up', 'incline pushup|hands elevated push-up', 'bodyweight', 'chest', 'Horizontal push', 'c', 'r', 'b', 'chest_lower chest_mid', 'TRI delt_front', 'AB', 'Hands on a bench or bar; easier than the floor.'],
  ['decline-push-up', 'Decline push-up', 'feet elevated push-up|decline pushup', 'bodyweight', 'chest', 'Horizontal push', 'c', 'r', 'b', 'chest_upper', 'chest_mid delt_front TRI', 'AB', 'Feet on a bench; keep your hips in line.'],
  ['diamond-push-up', 'Diamond push-up', 'close grip push-up|triangle push-up', 'bodyweight', 'triceps', 'Horizontal push', 'c', 'r', 'b', 'TRI', 'chest_mid delt_front', 'AB', 'Hands together under the chest; elbows brush your sides.'],
  ['band-chest-press', 'Band chest press', 'banded chest press|resistance band press', 'band', 'chest', 'Horizontal push', 'c', 'r', 'b', 'chest_mid chest_lower', 'delt_front TRI', 'CORE:0.4', 'Band anchored behind you at chest height; press forward.'],
  ['chest-dip', 'Dips', 'dip|chest dips|parallel bar dips|dips', 'bodyweight', 'chest', 'Vertical push', 'c', 'wr', 'a', 'chest_lower TRI', 'delt_front chest_mid', 'AB', 'Lean forward slightly, lower until the upper arms are level, press up. Add weight with a belt.'],
  ['assisted-dip', 'Assisted dip', 'machine assisted dip', 'machine', 'chest', 'Vertical push', 'c', 'wr', 'x', 'chest_lower TRI', 'delt_front', '', 'Enter the assistance used; less assistance is progress.'],
  ['svend-press', 'Svend press', 'plate squeeze press', 'other', 'chest', 'Horizontal push', 'i', 'wr', 's', 'chest_mid', 'chest_upper delt_front', '', 'Squeeze a plate between your palms and press it out.'],

  // Back
  ['deadlift', 'Deadlift', 'conventional deadlift|barbell deadlift|dl', 'barbell', 'back', 'Hinge', 'c', 'wr', 't', 'glute_max HM erectors', 'QD:0.5 traps lats:0.4 FA', 'CORE rhomboids', 'Bar over mid-foot, flat back, push the floor away and stand tall.'],
  ['sumo-deadlift', 'Sumo deadlift', 'sumo', 'barbell', 'glutes', 'Hinge', 'c', 'wr', 't', 'glute_max adductors QD:0.7', 'HM erectors traps', 'CORE FA', 'Wide stance, hands inside the knees, chest up.'],
  ['trap-bar-deadlift', 'Trap bar deadlift', 'hex bar deadlift|trap bar dl', 'trapbar', 'quads', 'Hinge', 'c', 'wr', 't', 'QD glute_max', 'HM erectors traps', 'CORE FA', 'Stand in the middle, grip the handles, drive up through the floor.'],
  ['rack-pull', 'Rack pull', 'block pull', 'barbell', 'back', 'Hinge', 'c', 'wr', 't', 'erectors traps glute_max', 'HM lats:0.4 FA', 'CORE', 'Bar on pins at knee height; lock out hips and shoulders together.'],
  ['barbell-row', 'Barbell row', 'bent over row|bent-over row|bb row|pendlay row', 'barbell', 'back', 'Horizontal pull', 'c', 'wr', 't', 'lats rhomboids traps', 'delt_rear BICEPS erectors', 'HM:0.3 CORE', 'Hinge to about 45 degrees and row the bar to your lower ribs.'],
  ['dumbbell-row', 'One-arm dumbbell row', 'single arm dumbbell row|db row|dumbbell row|one arm row', 'dumbbell', 'back', 'Horizontal pull', 'c', 'wr', 's', 'lats rhomboids', 'traps delt_rear BICEPS', 'CORE obliques', 'Hand and knee on a bench; pull the dumbbell to your hip.'],
  ['chest-supported-row', 'Chest-supported dumbbell row', 'incline dumbbell row|seal row', 'dumbbell', 'back', 'Horizontal pull', 'c', 'wr', 'p', 'rhomboids traps lats', 'delt_rear BICEPS', '', 'Chest on an incline bench; row both dumbbells, squeeze the shoulder blades.'],
  ['t-bar-row', 'T-bar row', 'tbar row|landmine row', 'barbell', 'back', 'Horizontal pull', 'c', 'wr', 't', 'lats rhomboids traps', 'delt_rear BICEPS erectors', 'HM:0.3', 'Straddle the bar, flat back, pull the handle to your chest.'],
  ['seated-cable-row', 'Seated cable row', 'cable row|seated row|low row', 'cable', 'back', 'Horizontal pull', 'c', 'wr', 't', 'lats rhomboids', 'traps delt_rear BICEPS', 'erectors:0.3', 'Sit tall, pull the handle to your stomach, let the shoulders reach forward.'],
  ['machine-row', 'Machine row', 'seated machine row|chest supported machine row', 'machine', 'back', 'Horizontal pull', 'c', 'wr', 't', 'lats rhomboids traps', 'delt_rear BICEPS', '', 'Chest on the pad; drive the elbows back.'],
  ['inverted-row', 'Inverted row', 'body row|australian pull-up|table row|bodyweight row', 'bodyweight', 'back', 'Horizontal pull', 'c', 'r', 'b', 'rhomboids lats', 'traps delt_rear BICEPS', 'CORE', 'Hang under a bar or table edge, body straight, pull your chest up.'],
  ['band-row', 'Band row', 'resistance band row|banded row', 'band', 'back', 'Horizontal pull', 'c', 'r', 'b', 'rhomboids lats', 'traps delt_rear BICEPS', '', 'Band anchored in front; row to your stomach.'],
  ['pull-up', 'Pull-up', 'pullup|pull up|wide grip pull-up', 'bodyweight', 'back', 'Vertical pull', 'c', 'wr', 'a', 'lats', 'rhomboids traps BICEPS delt_rear', 'CORE FA', 'Overhand grip, pull until your chin clears the bar. Add weight with a belt.'],
  ['chin-up', 'Chin-up', 'chinup|chin up|underhand pull-up', 'bodyweight', 'back', 'Vertical pull', 'c', 'wr', 'a', 'lats BICEPS', 'rhomboids traps', 'CORE FA', 'Underhand grip, shoulder-width; chest to the bar.'],
  ['neutral-grip-pull-up', 'Neutral-grip pull-up', 'hammer grip pull-up|parallel grip pull-up', 'bodyweight', 'back', 'Vertical pull', 'c', 'wr', 'a', 'lats', 'brachialis biceps brachioradialis rhomboids', 'CORE', 'Palms facing; pull your chest towards the handles.'],
  ['assisted-pull-up', 'Assisted pull-up', 'machine assisted pull-up|band assisted pull-up|assisted chin-up', 'machine', 'back', 'Vertical pull', 'c', 'wr', 'x', 'lats', 'rhomboids BICEPS', '', 'Enter the assistance used; less assistance is progress.'],
  ['negative-pull-up', 'Negative pull-up', 'eccentric pull-up', 'bodyweight', 'back', 'Vertical pull', 'c', 'r', 'b', 'lats', 'BICEPS rhomboids', 'CORE', 'Jump to the top and lower yourself over 3 to 5 seconds.'],
  ['towel-row', 'Pull-up or towel row', 'towel row|door row', 'bodyweight', 'back', 'Vertical pull', 'c', 'r', 'b', 'lats rhomboids', 'BICEPS traps', 'FA', 'Pull-ups if you have a bar; otherwise a towel looped around a sturdy door.'],
  ['lat-pulldown', 'Lat pulldown', 'pulldown|wide grip pulldown|lat pull down', 'cable', 'back', 'Vertical pull', 'c', 'wr', 't', 'lats', 'rhomboids traps:0.4 BICEPS delt_rear', '', 'Lean back slightly and pull the bar to your upper chest.'],
  ['close-grip-pulldown', 'Close-grip pulldown', 'v-bar pulldown|neutral grip pulldown', 'cable', 'back', 'Vertical pull', 'c', 'wr', 't', 'lats', 'BICEPS rhomboids', '', 'V-handle; pull to the top of the chest.'],
  ['straight-arm-pulldown', 'Straight-arm pulldown', 'straight arm lat pulldown|cable pullover', 'cable', 'back', 'Vertical pull', 'i', 'wr', 't', 'lats', 'tri_long:0.4 delt_rear:0.3', 'AB', 'Arms almost straight; sweep the bar down to your thighs.'],
  ['dumbbell-pullover', 'Dumbbell pullover', 'pullover|db pullover', 'dumbbell', 'back', 'Vertical pull', 'i', 'wr', 's', 'lats chest_mid:0.6', 'tri_long:0.4', 'AB', 'Across a bench, lower the dumbbell behind your head, pull it back over the chest.'],
  ['band-pulldown', 'Band pulldown', 'banded lat pulldown', 'band', 'back', 'Vertical pull', 'c', 'r', 'b', 'lats', 'BICEPS rhomboids', '', 'Band anchored high; pull down to your chest.'],
  ['shrug', 'Barbell shrug', 'shrug|shrugs|bb shrug', 'barbell', 'back', 'Shrug', 'i', 'wr', 't', 'traps', 'FA:0.4', '', 'Lift the shoulders straight up to the ears, pause, lower.'],
  ['dumbbell-shrug', 'Dumbbell shrug', 'db shrug', 'dumbbell', 'back', 'Shrug', 'i', 'wr', 'p', 'traps', 'FA:0.4', '', 'Same as a barbell shrug with dumbbells at your sides.'],
  ['back-extension', 'Back extension', 'hyperextension|45 degree back extension|roman chair', 'bodyweight', 'back', 'Hip extension', 'c', 'wr', 'a', 'erectors glute_max', 'HM', '', 'Hinge at the hips over the pad and rise until your body is straight. Hold a plate to add weight.'],
  ['superman', 'Superman', 'superman hold|prone back raise', 'bodyweight', 'back', 'Hip extension', 'i', 'd', 'b', 'erectors', 'glute_max delt_rear:0.3', '', 'Face down; lift arms and legs and hold.'],
  ['prone-y-raise', 'Prone Y raise', 'y raise|prone y', 'bodyweight', 'shoulders', 'Shoulder raise', 'i', 'r', 'b', 'traps delt_rear', 'rhomboids', '', 'Face down; raise your arms in a Y with thumbs up.'],
  ['good-morning', 'Good morning', 'barbell good morning', 'barbell', 'hamstrings', 'Hinge', 'c', 'wr', 't', 'HM erectors', 'glute_max', 'CORE', 'Bar on your back, soft knees, push the hips back until your torso is near level.'],

  // Shoulders
  ['overhead-press', 'Overhead press', 'ohp|military press|standing press|barbell overhead press|shoulder press barbell', 'barbell', 'shoulders', 'Vertical push', 'c', 'wr', 't', 'delt_front delt_side:0.7', 'TRI chest_upper:0.4 traps:0.4', 'CORE glute_max:0.2', 'Squeeze glutes, press the bar straight up past your face, finish with it over your head.'],
  ['seated-barbell-press', 'Seated barbell shoulder press', 'seated military press', 'barbell', 'shoulders', 'Vertical push', 'c', 'wr', 't', 'delt_front delt_side:0.7', 'TRI traps:0.3', '', 'Sit upright with back support; press overhead.'],
  ['push-press', 'Push press', 'barbell push press', 'barbell', 'shoulders', 'Vertical push', 'c', 'wr', 't', 'delt_front TRI', 'delt_side QD:0.4 glute_max:0.3', 'CORE', 'Small dip with the legs, then drive the bar overhead.'],
  ['dumbbell-shoulder-press', 'Dumbbell shoulder press', 'db shoulder press|seated dumbbell press|dumbbell overhead press', 'dumbbell', 'shoulders', 'Vertical push', 'c', 'wr', 'p', 'delt_front delt_side:0.7', 'TRI traps:0.3', 'CORE:0.3', 'Dumbbells at ear height; press up without clanking them together.'],
  ['arnold-press', 'Arnold press', 'arnold dumbbell press', 'dumbbell', 'shoulders', 'Vertical push', 'c', 'wr', 'p', 'delt_front delt_side', 'TRI', '', 'Start palms facing you, rotate out as you press.'],
  ['machine-shoulder-press', 'Machine shoulder press', 'shoulder press machine|shoulder press', 'machine', 'shoulders', 'Vertical push', 'c', 'wr', 't', 'delt_front delt_side:0.7', 'TRI', '', 'Handles just above shoulder height; press up.'],
  ['landmine-press', 'Landmine press', 'single arm landmine press', 'barbell', 'shoulders', 'Vertical push', 'c', 'wr', 's', 'delt_front chest_upper', 'TRI', 'CORE obliques', 'Press the end of the bar up and forward, one arm at a time.'],
  ['pike-push-up', 'Pike push-up', 'pike pushup', 'bodyweight', 'shoulders', 'Vertical push', 'c', 'r', 'b', 'delt_front', 'TRI delt_side traps:0.3', 'CORE', 'Hips high in an upside-down V; lower your head towards the floor.'],
  ['handstand-push-up', 'Handstand push-up', 'hspu|wall handstand push-up', 'bodyweight', 'shoulders', 'Vertical push', 'c', 'r', 'b', 'delt_front TRI', 'delt_side traps', 'CORE', 'Against a wall; lower your head to the floor and press back up.'],
  ['wall-handstand-hold', 'Wall handstand hold', 'handstand hold', 'bodyweight', 'shoulders', 'Vertical push', 'c', 'd', 'b', 'delt_front', 'TRI traps', 'CORE FA', 'Kick up to a wall, arms locked, hold.'],
  ['lateral-raise', 'Lateral raise', 'side raise|dumbbell lateral raise|side lateral raise|lat raise', 'dumbbell', 'shoulders', 'Shoulder raise', 'i', 'wr', 'p', 'delt_side', 'delt_front:0.3 traps:0.3', '', 'Raise the dumbbells out to shoulder height, leading with the elbows.'],
  ['cable-lateral-raise', 'Cable lateral raise', 'single arm cable lateral raise|cable side raise|cable raise', 'cable', 'shoulders', 'Shoulder raise', 'i', 'wr', 't', 'delt_side', 'delt_front:0.3 traps:0.3', '', 'Pulley at hand height across your body; raise out to the side.'],
  ['machine-lateral-raise', 'Machine lateral raise', 'lateral raise machine', 'machine', 'shoulders', 'Shoulder raise', 'i', 'wr', 't', 'delt_side', 'traps:0.3', '', 'Pads on the outside of your arms; raise to shoulder height.'],
  ['band-lateral-raise', 'Band lateral raise', 'banded lateral raise', 'band', 'shoulders', 'Shoulder raise', 'i', 'r', 'b', 'delt_side', 'traps:0.3', '', 'Stand on the band; raise out to the sides.'],
  ['front-raise', 'Front raise', 'dumbbell front raise|plate front raise', 'dumbbell', 'shoulders', 'Shoulder raise', 'i', 'wr', 'p', 'delt_front', 'chest_upper:0.4 delt_side:0.3', '', 'Raise straight in front to shoulder height.'],
  ['cable-front-raise', 'Cable front raise', 'cable front raise', 'cable', 'shoulders', 'Shoulder raise', 'i', 'wr', 't', 'delt_front', 'chest_upper:0.4', '', 'Pulley low behind you; raise forward to eye level.'],
  ['rear-delt-fly', 'Rear delt fly', 'reverse fly|bent over reverse fly|rear delt raise|reverse dumbbell fly', 'dumbbell', 'shoulders', 'Fly', 'i', 'wr', 'p', 'delt_rear', 'rhomboids traps:0.4', '', 'Hinge forward and open your arms wide, thumbs down slightly.'],
  ['reverse-pec-deck', 'Reverse pec deck', 'rear delt machine|reverse machine fly', 'machine', 'shoulders', 'Fly', 'i', 'wr', 't', 'delt_rear', 'rhomboids traps:0.4', '', 'Face the pad; sweep the handles back.'],
  ['cable-rear-delt-fly', 'Cable rear delt fly', 'cable reverse fly', 'cable', 'shoulders', 'Fly', 'i', 'wr', 't', 'delt_rear', 'rhomboids traps:0.4', '', 'Cross the cables at shoulder height and pull them apart.'],
  ['face-pull', 'Face pull', 'cable face pull|rope face pull', 'cable', 'shoulders', 'Horizontal pull', 'i', 'wr', 't', 'delt_rear', 'traps rhomboids', '', 'Rope at face height; pull towards your forehead, hands apart.'],
  ['band-pull-apart', 'Band pull-apart', 'pull apart|band pull apart', 'band', 'shoulders', 'Horizontal pull', 'i', 'r', 'b', 'delt_rear', 'rhomboids traps', '', 'Arms straight in front; pull the band apart to your chest.'],
  ['upright-row', 'Upright row', 'barbell upright row|cable upright row', 'barbell', 'shoulders', 'Vertical pull', 'c', 'wr', 't', 'delt_side traps', 'BICEPS:0.3', '', 'Wide grip; pull the bar to lower-chest height, elbows high.'],

  // Biceps
  ['barbell-curl', 'Barbell curl', 'bb curl|standing barbell curl|straight bar curl', 'barbell', 'biceps', 'Elbow flexion', 'i', 'wr', 't', 'biceps', 'brachialis brachioradialis', 'FA', 'Elbows pinned at your sides; curl without swinging.'],
  ['ez-bar-curl', 'EZ-bar curl', 'ez curl|ezbar curl', 'ezbar', 'biceps', 'Elbow flexion', 'i', 'wr', 't', 'biceps', 'brachialis brachioradialis', 'FA', 'Angled grip is easier on the wrists; same form as a barbell curl.'],
  ['dumbbell-curl', 'Dumbbell curl', 'db curl|bicep curl|biceps curl|alternating dumbbell curl', 'dumbbell', 'biceps', 'Elbow flexion', 'i', 'wr', 'p', 'biceps', 'brachialis brachioradialis', 'FA', 'Turn the palms up as you curl; lower slowly.'],
  ['hammer-curl', 'Hammer curl', 'dumbbell hammer curl|neutral grip curl', 'dumbbell', 'biceps', 'Elbow flexion', 'i', 'wr', 'p', 'brachialis brachioradialis', 'biceps', 'FA', 'Palms facing each other the whole way.'],
  ['incline-dumbbell-curl', 'Incline dumbbell curl', 'incline curl', 'dumbbell', 'biceps', 'Elbow flexion', 'i', 'wr', 'p', 'biceps', 'brachialis', '', 'Lie back on a 45-degree bench, arms hanging, curl.'],
  ['preacher-curl', 'Preacher curl', 'ez bar preacher curl|scott curl|machine preacher curl', 'ezbar', 'biceps', 'Elbow flexion', 'i', 'wr', 't', 'biceps brachialis', 'brachioradialis', '', 'Arms over the pad; don’t let the elbows lift.'],
  ['concentration-curl', 'Concentration curl', 'seated concentration curl', 'dumbbell', 'biceps', 'Elbow flexion', 'i', 'wr', 's', 'biceps', 'brachialis', '', 'Elbow braced on your inner thigh; curl slowly.'],
  ['cable-curl', 'Cable curl', 'cable bicep curl|rope curl|straight bar cable curl', 'cable', 'biceps', 'Elbow flexion', 'i', 'wr', 't', 'biceps', 'brachialis brachioradialis', '', 'Low pulley; keep tension the whole way.'],
  ['bayesian-curl', 'Bayesian cable curl', 'bayesian curl|behind the back cable curl', 'cable', 'biceps', 'Elbow flexion', 'i', 'wr', 't', 'biceps', 'brachialis', '', 'Face away from the low pulley, arm behind you, curl.'],
  ['spider-curl', 'Spider curl', 'prone incline curl', 'dumbbell', 'biceps', 'Elbow flexion', 'i', 'wr', 'p', 'biceps', 'brachialis', '', 'Chest on an incline bench, arms hanging, curl.'],
  ['reverse-curl', 'Reverse curl', 'reverse barbell curl|overhand curl|reverse grip curl', 'ezbar', 'forearms', 'Elbow flexion', 'i', 'wr', 't', 'brachioradialis brachialis', 'forearm_ext biceps:0.5', '', 'Overhand grip; curl up keeping the wrists straight.'],
  ['band-curl', 'Band curl', 'resistance band curl', 'band', 'biceps', 'Elbow flexion', 'i', 'r', 'b', 'biceps', 'brachialis brachioradialis', '', 'Stand on the band; curl up.'],
  ['chin-up-hold', 'Chin-up hold', 'flexed arm hang|chin hold', 'bodyweight', 'biceps', 'Elbow flexion', 'c', 'd', 'b', 'biceps lats', 'brachialis', 'FA', 'Hold the top of a chin-up, chin over the bar.'],

  // Triceps
  ['triceps-pushdown', 'Triceps pushdown', 'tricep pushdown|cable pushdown|pushdown|bar pushdown', 'cable', 'triceps', 'Elbow extension', 'i', 'wr', 't', 'tri_lateral tri_medial', 'tri_long:0.7', '', 'Elbows at your sides; push down until straight.'],
  ['rope-pushdown', 'Rope pushdown', 'rope tricep extension|rope triceps pushdown|rope extension', 'cable', 'triceps', 'Elbow extension', 'i', 'wr', 't', 'tri_lateral tri_medial', 'tri_long:0.7', '', 'Spread the rope apart at the bottom.'],
  ['overhead-cable-extension', 'Overhead cable extension', 'overhead rope extension|cable overhead triceps extension', 'cable', 'triceps', 'Elbow extension', 'i', 'wr', 't', 'tri_long', 'tri_lateral tri_medial', 'CORE:0.3', 'Face away from the pulley; extend overhead.'],
  ['overhead-triceps-extension', 'Overhead triceps extension', 'dumbbell overhead extension|overhead tricep extension|french press', 'dumbbell', 'triceps', 'Elbow extension', 'i', 'wr', 's', 'tri_long', 'tri_lateral tri_medial', 'CORE:0.3', 'Hold one dumbbell overhead with both hands; lower behind your head.'],
  ['skull-crusher', 'Skull crusher', 'lying triceps extension|ez bar skull crusher|skullcrusher', 'ezbar', 'triceps', 'Elbow extension', 'i', 'wr', 't', 'tri_long tri_lateral', 'tri_medial', '', 'Lower the bar to your forehead or just behind; elbows still.'],
  ['dumbbell-skull-crusher', 'Dumbbell skull crusher', 'db skull crusher|dumbbell lying extension', 'dumbbell', 'triceps', 'Elbow extension', 'i', 'wr', 'p', 'tri_long tri_lateral', 'tri_medial', '', 'Palms facing; lower beside your head.'],
  ['triceps-kickback', 'Triceps kickback', 'tricep kickback|dumbbell kickback|cable kickback', 'dumbbell', 'triceps', 'Elbow extension', 'i', 'wr', 's', 'tri_lateral tri_long', 'tri_medial', '', 'Upper arm parallel to the floor; straighten the elbow.'],
  ['bench-dip', 'Bench dip', 'tricep dip|chair dip|bench dips', 'bodyweight', 'triceps', 'Vertical push', 'c', 'r', 'b', 'TRI', 'delt_front chest_lower:0.4', '', 'Hands on a bench behind you; bend the elbows to 90 degrees.'],
  ['machine-dip', 'Machine triceps dip', 'seated dip machine', 'machine', 'triceps', 'Vertical push', 'c', 'wr', 't', 'TRI', 'chest_lower delt_front', '', 'Push the handles down until your arms are straight.'],
  ['band-pushdown', 'Band pushdown', 'banded tricep pushdown', 'band', 'triceps', 'Elbow extension', 'i', 'r', 'b', 'tri_lateral tri_medial', 'tri_long', '', 'Band anchored high; push down.'],

  // Quads
  ['back-squat', 'Barbell back squat', 'back squat|squat|squats|barbell squat|bb squat|high bar squat|low bar squat', 'barbell', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'adductors HM:0.3 erectors', 'CORE GLM CF:0.2', 'Brace, sit down between your heels until thighs are about parallel, drive up.'],
  ['front-squat', 'Front squat', 'barbell front squat', 'barbell', 'quads', 'Squat', 'c', 'wr', 't', 'QD', 'glute_max erectors', 'CORE traps:0.2', 'Bar on the front of the shoulders, elbows high, sit straight down.'],
  ['box-squat', 'Box squat', 'barbell box squat', 'barbell', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'HM adductors', 'CORE', 'Sit back to a box, pause, stand.'],
  ['pause-squat', 'Pause squat', 'paused squat', 'barbell', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'adductors erectors', 'CORE', 'Squat and hold the bottom for two seconds.'],
  ['smith-squat', 'Smith machine squat', 'smith squat', 'smith', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'adductors', '', 'Feet slightly forward of the bar; squat down.'],
  ['goblet-squat', 'Goblet squat', 'dumbbell goblet squat|kettlebell goblet squat', 'dumbbell', 'quads', 'Squat', 'c', 'wr', 's', 'QD glute_max', 'adductors', 'CORE', 'Hold one weight at your chest; elbows between the knees at the bottom.'],
  ['dumbbell-squat', 'Dumbbell squat', 'db squat', 'dumbbell', 'quads', 'Squat', 'c', 'wr', 'p', 'QD glute_max', 'adductors', 'FA CORE', 'Dumbbells at your sides; squat down.'],
  ['bodyweight-squat', 'Bodyweight squat', 'air squat|squat bodyweight', 'bodyweight', 'quads', 'Squat', 'c', 'r', 'b', 'QD glute_max', 'adductors', '', 'Arms forward for balance; sit down and up.'],
  ['jump-squat', 'Jump squat', 'squat jump', 'bodyweight', 'quads', 'Explosive', 'c', 'r', 'b', 'QD glute_max', 'CF', 'CORE', 'Quarter squat and jump; land softly.'],
  ['pistol-squat', 'Pistol squat', 'single leg squat|pistol', 'bodyweight', 'quads', 'Squat', 'c', 'r', 'b', 'QD glute_max', 'glute_med', 'CORE', 'One leg out in front; squat down on the other.'],
  ['leg-press', 'Leg press', 'machine leg press|45 degree leg press', 'machine', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'adductors HM:0.3', '', 'Feet shoulder-width; lower until the knees reach about 90 degrees.'],
  ['hack-squat', 'Hack squat', 'machine hack squat', 'machine', 'quads', 'Squat', 'c', 'wr', 't', 'QD', 'glute_max', '', 'Back on the pad; squat deep with knees over toes.'],
  ['belt-squat', 'Belt squat', 'belt squat machine', 'machine', 'quads', 'Squat', 'c', 'wr', 't', 'QD glute_max', 'adductors', '', 'Load hangs from your hips; squat with a tall torso.'],
  ['leg-extension', 'Leg extension', 'quad extension|machine leg extension', 'machine', 'quads', 'Knee extension', 'i', 'wr', 't', 'QD', '', '', 'Straighten the knees fully, pause, lower slowly.'],
  ['sissy-squat', 'Sissy squat', 'sissy', 'bodyweight', 'quads', 'Knee extension', 'i', 'r', 'b', 'rectus_femoris vastus_lat vastus_med vastus_int', '', 'CORE', 'Hold on for balance; knees forward, lean back.'],
  ['bulgarian-split-squat', 'Bulgarian split squat', 'bss|rear foot elevated split squat|split squat elevated', 'dumbbell', 'quads', 'Lunge', 'c', 'wr', 'p', 'QD glute_max', 'adductors glute_med HM:0.3', 'CORE', 'Back foot on a bench; drop the back knee straight down.'],
  ['split-squat', 'Split squat', 'static lunge|dumbbell split squat', 'dumbbell', 'quads', 'Lunge', 'c', 'wr', 'p', 'QD glute_max', 'adductors glute_med', 'CORE', 'Staggered stance; lower the back knee towards the floor.'],
  ['walking-lunge', 'Walking lunge', 'lunges|dumbbell walking lunge|walking lunges', 'dumbbell', 'quads', 'Lunge', 'c', 'wr', 'p', 'QD glute_max', 'adductors glute_med HM:0.3', 'CORE', 'Long steps; back knee just above the floor.'],
  ['reverse-lunge', 'Reverse lunge', 'backward lunge|reverse lunges', 'bodyweight', 'glutes', 'Lunge', 'c', 'wr', 'a', 'glute_max QD', 'adductors glute_med', 'CORE', 'Step back and lower; push through the front heel. Hold dumbbells to add weight.'],
  ['forward-lunge', 'Forward lunge', 'lunge|front lunge', 'dumbbell', 'quads', 'Lunge', 'c', 'wr', 'p', 'QD glute_max', 'adductors', 'CORE', 'Step forward and drop the back knee; push back to standing.'],
  ['barbell-lunge', 'Barbell lunge', 'barbell walking lunge', 'barbell', 'quads', 'Lunge', 'c', 'wr', 't', 'QD glute_max', 'adductors glute_med', 'CORE', 'Bar on your back; step forward or back.'],
  ['lateral-lunge', 'Lateral lunge', 'side lunge|cossack squat', 'bodyweight', 'quads', 'Lunge', 'c', 'wr', 'a', 'adductors QD', 'glute_max glute_med', '', 'Step wide to the side and sit into that hip.'],
  ['step-up', 'Step-up', 'dumbbell step up|box step up|step ups', 'dumbbell', 'quads', 'Lunge', 'c', 'wr', 'p', 'QD glute_max', 'glute_med HM:0.3', 'CF:0.2', 'Whole foot on the box; drive up without pushing off the back leg.'],
  ['wall-sit', 'Wall sit', 'wall squat', 'bodyweight', 'quads', 'Squat', 'i', 'd', 'b', 'QD', 'glute_max:0.4', '', 'Back on the wall, thighs parallel, hold.'],
  ['weighted-wall-sit', 'Weighted wall sit', 'plate wall sit', 'bodyweight', 'quads', 'Squat', 'i', 'wd', 'a', 'QD', 'glute_max:0.4', '', 'Same as a wall sit with a plate on your thighs.'],
  ['band-squat', 'Band squat', 'banded squat', 'band', 'quads', 'Squat', 'c', 'r', 'b', 'QD glute_max', 'adductors', '', 'Stand on the band with it over your shoulders; squat.'],

  // Hamstrings
  ['romanian-deadlift', 'Romanian deadlift', 'rdl|barbell rdl|romanian dead lift|barbell romanian deadlift', 'barbell', 'hamstrings', 'Hinge', 'c', 'wr', 't', 'HM glute_max', 'erectors adductors:0.4 FA', 'CORE traps:0.2', 'Soft knees, push the hips back, bar slides down the thighs to mid-shin.'],
  ['dumbbell-romanian-deadlift', 'Dumbbell Romanian deadlift', 'db rdl|dumbbell rdl', 'dumbbell', 'hamstrings', 'Hinge', 'c', 'wr', 'p', 'HM glute_max', 'erectors FA', 'CORE', 'Same as a barbell RDL with dumbbells.'],
  ['single-leg-rdl', 'Single-leg Romanian deadlift', 'single leg rdl|sl rdl|single-leg hip hinge|single leg deadlift', 'dumbbell', 'hamstrings', 'Hinge', 'c', 'wr', 's', 'HM glute_max', 'glute_med erectors', 'CORE', 'Hinge on one leg, back leg straight behind you.'],
  ['stiff-leg-deadlift', 'Stiff-leg deadlift', 'sldl|stiff legged deadlift|straight leg deadlift', 'barbell', 'hamstrings', 'Hinge', 'c', 'wr', 't', 'HM', 'glute_max erectors', 'CORE FA', 'Knees nearly straight; hinge until you feel a strong stretch.'],
  ['lying-leg-curl', 'Lying leg curl', 'leg curl|hamstring curl|prone leg curl', 'machine', 'hamstrings', 'Knee flexion', 'i', 'wr', 't', 'HM', 'gastrocnemius:0.4', '', 'Hips down on the pad; curl the heels to your glutes.'],
  ['seated-leg-curl', 'Seated leg curl', 'seated hamstring curl', 'machine', 'hamstrings', 'Knee flexion', 'i', 'wr', 't', 'HM', 'gastrocnemius:0.3', '', 'Thigh pad snug; curl down and back.'],
  ['nordic-curl', 'Nordic curl', 'nordic hamstring curl|nordics', 'bodyweight', 'hamstrings', 'Knee flexion', 'i', 'r', 'b', 'HM', 'gastrocnemius:0.3', 'glute_max:0.2', 'Ankles anchored; lower your body as slowly as you can.'],
  ['glute-ham-raise', 'Glute-ham raise', 'ghr|glute ham raise', 'machine', 'hamstrings', 'Knee flexion', 'c', 'r', 'b', 'HM', 'glute_max gastrocnemius:0.3', 'erectors:0.3', 'Lower from upright to flat, then curl back up with the hamstrings.'],
  ['band-leg-curl', 'Band leg curl', 'banded hamstring curl', 'band', 'hamstrings', 'Knee flexion', 'i', 'r', 'b', 'HM', '', '', 'Lying face down, band around your ankles; curl.'],
  ['kettlebell-swing', 'Kettlebell swing', 'kb swing|russian swing|swings', 'kettlebell', 'functional', 'Hinge', 'c', 'wr', 's', 'glute_max HM', 'erectors delt_front:0.3', 'CORE FA', 'Snap the hips forward to float the bell to chest height.'],

  // Glutes
  ['hip-thrust', 'Hip thrust', 'barbell hip thrust|glute thrust', 'barbell', 'glutes', 'Hip extension', 'c', 'wr', 't', 'glute_max', 'HM:0.5 GLM', 'QD:0.2 CORE', 'Upper back on a bench, drive the hips up and squeeze, chin tucked.'],
  ['dumbbell-hip-thrust', 'Dumbbell hip thrust', 'db hip thrust', 'dumbbell', 'glutes', 'Hip extension', 'c', 'wr', 's', 'glute_max', 'HM:0.5 GLM', '', 'One heavy dumbbell on your hips.'],
  ['machine-hip-thrust', 'Machine hip thrust', 'hip thrust machine', 'machine', 'glutes', 'Hip extension', 'c', 'wr', 't', 'glute_max', 'HM:0.5 GLM', '', 'Belt over the hips; drive up and pause.'],
  ['glute-bridge', 'Glute bridge', 'bridge|hip bridge|floor bridge', 'bodyweight', 'glutes', 'Hip extension', 'c', 'wr', 'a', 'glute_max', 'HM:0.5', 'CORE', 'Lying on your back, feet flat, lift the hips. Add a weight on your hips if you like.'],
  ['single-leg-glute-bridge', 'Single-leg glute bridge', 'single leg bridge', 'bodyweight', 'glutes', 'Hip extension', 'c', 'r', 'b', 'glute_max', 'HM GLM', 'CORE', 'One foot down, the other leg up; lift the hips.'],
  ['cable-kickback', 'Cable glute kickback', 'glute kickback|cable kickback glute|donkey kick', 'cable', 'glutes', 'Hip extension', 'i', 'wr', 't', 'glute_max', 'HM:0.4', 'CORE', 'Ankle strap on; kick the leg straight back.'],
  ['cable-pull-through', 'Cable pull-through', 'pull through|rope pull-through', 'cable', 'glutes', 'Hinge', 'c', 'wr', 't', 'glute_max HM', 'erectors', '', 'Facing away from a low pulley, hinge and snap the hips forward.'],
  ['hip-abduction-machine', 'Hip abduction machine', 'abductor machine|hip abduction|outer thigh machine', 'machine', 'glutes', 'Hip abduction', 'i', 'wr', 't', 'glute_med glute_min abductors', 'glute_max:0.3', '', 'Push the pads apart and pause.'],
  ['band-abduction', 'Banded hip abduction', 'band abduction|clamshell|banded clamshell', 'band', 'glutes', 'Hip abduction', 'i', 'r', 'b', 'glute_med glute_min', 'abductors', '', 'Band around your knees; push them apart.'],
  ['cable-hip-abduction', 'Cable hip abduction', 'standing cable abduction', 'cable', 'glutes', 'Hip abduction', 'i', 'wr', 't', 'glute_med glute_min', 'abductors', 'CORE', 'Strap on the outside ankle; raise the leg out.'],
  ['hip-adduction-machine', 'Hip adduction machine', 'adductor machine|hip adduction|inner thigh machine', 'machine', 'glutes', 'Hip adduction', 'i', 'wr', 't', 'adductors', '', '', 'Squeeze the pads together.'],
  ['copenhagen-plank', 'Copenhagen plank', 'copenhagen adduction|copenhagen', 'bodyweight', 'core', 'Hip adduction', 'i', 'd', 'b', 'adductors obliques', 'transverse_abdominis', '', 'Side plank with your top foot on a bench; hold.'],
  ['frog-pump', 'Frog pump', 'frog pumps', 'bodyweight', 'glutes', 'Hip extension', 'i', 'r', 'b', 'glute_max', 'GLM', '', 'Soles of the feet together; bridge up.'],

  // Calves
  ['standing-calf-raise', 'Standing calf raise', 'calf raise machine|standing calf raises|calf raises', 'machine', 'calves', 'Calf raise', 'i', 'wr', 't', 'gastrocnemius', 'soleus', '', 'Full stretch at the bottom, pause at the top.'],
  ['seated-calf-raise', 'Seated calf raise', 'seated calf raises', 'machine', 'calves', 'Calf raise', 'i', 'wr', 't', 'soleus', 'gastrocnemius:0.3', '', 'Knees bent under the pad; raise the heels.'],
  ['calf-raise', 'Calf raise', 'bodyweight calf raise|step calf raise', 'bodyweight', 'calves', 'Calf raise', 'i', 'r', 'b', 'gastrocnemius', 'soleus', '', 'On a step edge; lower slowly and rise high.'],
  ['single-leg-calf-raise', 'Single-leg calf raise', 'single leg calf raise|one leg calf raise|dumbbell calf raise', 'dumbbell', 'calves', 'Calf raise', 'i', 'wr', 's', 'gastrocnemius', 'soleus', '', 'One foot on a step; hold a dumbbell on the same side.'],
  ['leg-press-calf-raise', 'Leg press calf raise', 'calf press|toe press', 'machine', 'calves', 'Calf raise', 'i', 'wr', 't', 'gastrocnemius', 'soleus', '', 'Balls of the feet on the sled edge; press through the toes.'],
  ['donkey-calf-raise', 'Donkey calf raise', 'donkey raise', 'machine', 'calves', 'Calf raise', 'i', 'wr', 't', 'gastrocnemius', 'soleus', '', 'Bent over at the hips; raise the heels.'],
  ['tibialis-raise', 'Tibialis raise', 'tib raise|tibialis anterior raise|toe raise', 'bodyweight', 'calves', 'Ankle flexion', 'i', 'r', 'b', 'tibialis', '', '', 'Back against a wall, heels out; lift your toes.'],

  // Core
  ['plank', 'Plank', 'front plank|forearm plank', 'bodyweight', 'core', 'Core: anti-extension', 'i', 'd', 'b', 'rectus_abdominis transverse_abdominis', 'obliques glute_max:0.3', 'delt_front:0.2', 'Forearms down, straight line, squeeze glutes, breathe.'],
  ['weighted-plank', 'Weighted plank', 'plank with plate', 'bodyweight', 'core', 'Core: anti-extension', 'i', 'wd', 'a', 'rectus_abdominis transverse_abdominis', 'obliques glute_max:0.3', '', 'A plate on your upper back; same as a plank.'],
  ['side-plank', 'Side plank', 'side bridge', 'bodyweight', 'core', 'Core: anti-rotation', 'i', 'd', 'b', 'obliques', 'quadratus_lumborum transverse_abdominis glute_med', '', 'On one forearm, hips high, hold each side.'],
  ['hanging-leg-raise', 'Hanging leg raise', 'leg raise hanging|hanging knee raise|toes to bar', 'bodyweight', 'core', 'Core: flexion', 'i', 'r', 'b', 'rectus_abdominis hip_flexors', 'obliques', 'FA lats:0.2', 'Hang from a bar; raise your legs without swinging.'],
  ['lying-leg-raise', 'Lying leg raise', 'leg raise|leg raises', 'bodyweight', 'core', 'Core: flexion', 'i', 'r', 'b', 'rectus_abdominis hip_flexors', 'obliques', '', 'Low back pressed down; raise straight legs.'],
  ['captains-chair', 'Captain’s chair knee raise', 'captains chair|vertical knee raise|roman chair leg raise', 'machine', 'core', 'Core: flexion', 'i', 'r', 'b', 'rectus_abdominis hip_flexors', 'obliques', '', 'Back on the pad; bring the knees to the chest.'],
  ['crunch', 'Crunch', 'crunches|ab crunch', 'bodyweight', 'core', 'Core: flexion', 'i', 'r', 'b', 'rectus_abdominis', 'obliques', '', 'Curl the ribs towards the hips; lower slowly.'],
  ['sit-up', 'Sit-up', 'situp|sit ups', 'bodyweight', 'core', 'Core: flexion', 'i', 'r', 'b', 'rectus_abdominis hip_flexors', 'obliques', '', 'Feet anchored; roll up to sitting.'],
  ['cable-crunch', 'Cable crunch', 'kneeling cable crunch|rope crunch', 'cable', 'core', 'Core: flexion', 'i', 'wr', 't', 'rectus_abdominis', 'obliques', '', 'Kneel, rope by your head, crunch the ribs to the hips.'],
  ['machine-crunch', 'Machine crunch', 'ab machine|ab crunch machine', 'machine', 'core', 'Core: flexion', 'i', 'wr', 't', 'rectus_abdominis', 'obliques', '', 'Crunch down against the pads.'],
  ['decline-sit-up', 'Decline sit-up', 'decline crunch', 'bodyweight', 'core', 'Core: flexion', 'i', 'wr', 'a', 'rectus_abdominis hip_flexors', 'obliques', '', 'On a decline bench; hold a plate to add weight.'],
  ['ab-wheel-rollout', 'Ab wheel rollout', 'ab wheel|rollout|ab roller', 'other', 'core', 'Core: anti-extension', 'i', 'r', 'b', 'rectus_abdominis transverse_abdominis', 'lats obliques', 'delt_front:0.2', 'From your knees, roll out as far as you can keep a flat back.'],
  ['russian-twist', 'Russian twist', 'russian twists|seated twist', 'bodyweight', 'core', 'Core: rotation', 'i', 'wr', 's', 'obliques', 'rectus_abdominis', 'hip_flexors', 'Lean back, feet up if you can, rotate side to side. Hold a weight to add load.'],
  ['dead-bug', 'Dead bug', 'deadbug|dead bugs', 'bodyweight', 'core', 'Core: anti-extension', 'i', 'r', 'b', 'transverse_abdominis rectus_abdominis', 'obliques', '', 'On your back, lower the opposite arm and leg, keep the low back down.'],
  ['bird-dog', 'Bird dog', 'birddog', 'bodyweight', 'core', 'Core: anti-rotation', 'i', 'r', 'b', 'erectors transverse_abdominis', 'glute_max obliques', '', 'On hands and knees, reach the opposite arm and leg long.'],
  ['pallof-press', 'Pallof press', 'cable pallof press|anti rotation press', 'cable', 'core', 'Core: anti-rotation', 'i', 'wr', 't', 'obliques transverse_abdominis', 'rectus_abdominis', 'glute_med', 'Side-on to the pulley; press the handle out and resist the twist.'],
  ['band-pallof-press', 'Band Pallof press', 'banded pallof press', 'band', 'core', 'Core: anti-rotation', 'i', 'r', 'b', 'obliques transverse_abdominis', 'rectus_abdominis', '', 'Same as a cable Pallof press with a band.'],
  ['woodchop', 'Cable woodchop', 'woodchopper|wood chop', 'cable', 'core', 'Core: rotation', 'i', 'wr', 't', 'obliques', 'rectus_abdominis delt_front:0.3', 'glute_max:0.2', 'Rotate through the torso, high to low or low to high.'],
  ['mountain-climber', 'Mountain climbers', 'mountain climber', 'bodyweight', 'core', 'Conditioning', 'c', 'd', 'b', 'rectus_abdominis hip_flexors', 'delt_front QD:0.3', 'transverse_abdominis', 'Plank position; drive the knees in fast.'],
  ['hollow-hold', 'Hollow body hold', 'hollow hold|hollow body', 'bodyweight', 'core', 'Core: anti-extension', 'i', 'd', 'b', 'rectus_abdominis transverse_abdominis', 'hip_flexors', '', 'Low back pressed down, arms and legs long, hold.'],
  ['l-sit', 'L-sit', 'l sit hold', 'bodyweight', 'core', 'Core: flexion', 'c', 'd', 'b', 'rectus_abdominis hip_flexors', 'TRI QD:0.3', 'delt_front', 'Hands on parallettes or a floor, legs straight out, hold.'],
  ['bicycle-crunch', 'Bicycle crunch', 'bicycle crunches|bicycles', 'bodyweight', 'core', 'Core: rotation', 'i', 'r', 'b', 'obliques rectus_abdominis', 'hip_flexors', '', 'Elbow to opposite knee, alternating.'],
  ['side-bend', 'Dumbbell side bend', 'side bend|oblique bend', 'dumbbell', 'core', 'Core: lateral flexion', 'i', 'wr', 's', 'obliques quadratus_lumborum', '', '', 'Dumbbell in one hand; bend to the side and back up.'],
  ['suitcase-carry', 'Suitcase carry', 'single arm farmer carry|one arm carry', 'dumbbell', 'core', 'Carry', 'c', 'wm', 's', 'obliques quadratus_lumborum', 'FA traps glute_med', 'CORE', 'Heavy weight in one hand; walk tall without leaning.'],

  // Forearms and grip
  ['wrist-curl', 'Wrist curl', 'wrist curls|dumbbell wrist curl|barbell wrist curl', 'dumbbell', 'forearms', 'Grip', 'i', 'wr', 'p', 'forearm_flex', '', '', 'Forearms on your thighs, palms up; curl the wrists.'],
  ['reverse-wrist-curl', 'Reverse wrist curl', 'wrist extension', 'dumbbell', 'forearms', 'Grip', 'i', 'wr', 'p', 'forearm_ext', '', '', 'Palms down; lift the backs of the hands.'],
  ['farmers-carry', 'Farmer’s carry', 'farmers walk|farmer walk|farmers carry|farmer carry', 'dumbbell', 'forearms', 'Carry', 'c', 'wm', 'p', 'FA traps', 'CORE glute_med QD:0.3', 'CF:0.3', 'Heavy weights at your sides; walk tall with short quick steps.'],
  ['dead-hang', 'Dead hang', 'bar hang|hang', 'bodyweight', 'forearms', 'Grip', 'i', 'd', 'b', 'forearm_flex', 'lats:0.3', '', 'Hang from a bar with straight arms.'],
  ['weighted-dead-hang', 'Weighted dead hang', 'weighted hang', 'bodyweight', 'forearms', 'Grip', 'i', 'wd', 'a', 'forearm_flex', 'lats:0.3', '', 'A dead hang with weight on a belt.'],
  ['plate-pinch', 'Plate pinch', 'pinch grip|plate pinches', 'other', 'forearms', 'Grip', 'i', 'wd', 'p', 'forearm_flex', 'forearm_ext', '', 'Pinch two smooth plates together and hold.'],
  ['wrist-roller', 'Wrist roller', 'forearm roller', 'other', 'forearms', 'Grip', 'i', 'wr', 't', 'FA', 'brachioradialis', 'delt_front:0.3', 'Roll the weight up and down with arms out front.'],

  // Functional and conditioning
  ['sled-push', 'Sled push', 'prowler push|prowler', 'sled', 'functional', 'Conditioning', 'c', 'wm', 't', 'QD glute_max', 'CF HM:0.3', 'CORE delt_front:0.3', 'Low body angle, arms locked, drive with short steps.'],
  ['sled-pull', 'Sled pull', 'sled drag|backward sled drag', 'sled', 'functional', 'Conditioning', 'c', 'wm', 't', 'QD', 'glute_max HM CF', 'FA', 'Walk backwards pulling the sled with a rope or straps.'],
  ['battle-ropes', 'Battle ropes', 'battle rope|rope slams|battle rope waves', 'other', 'functional', 'Conditioning', 'c', 'd', 'b', 'delt_front', 'FA CORE biceps:0.3', 'QD:0.2', 'Athletic stance; make fast waves with both arms.'],
  ['turkish-get-up', 'Turkish get-up', 'get up|tgu|turkish getup', 'kettlebell', 'functional', 'Carry', 'c', 'wr', 's', 'delt_front CORE', 'glute_max QD TRI:0.3', 'traps rhomboids', 'Weight locked overhead; rise from lying to standing and back, step by step.'],
  ['burpee', 'Burpees', 'burpee', 'bodyweight', 'functional', 'Conditioning', 'c', 'r', 'b', 'QD chest_mid', 'delt_front TRI glute_max', 'CORE', 'Squat, kick back to a push-up, jump up.'],
  ['power-clean', 'Power clean', 'clean|barbell clean|hang clean', 'barbell', 'functional', 'Explosive', 'c', 'wr', 't', 'glute_max HM QD traps', 'erectors delt_front CF', 'CORE FA', 'Explode up from the floor and catch the bar on your shoulders.'],
  ['thruster', 'Thrusters', 'thruster|barbell thruster|dumbbell thruster', 'barbell', 'functional', 'Explosive', 'c', 'wr', 't', 'QD delt_front', 'glute_max TRI', 'CORE', 'Front squat straight into an overhead press.'],
  ['kettlebell-goblet-squat', 'Kettlebell goblet squat', 'kb goblet squat', 'kettlebell', 'quads', 'Squat', 'c', 'wr', 's', 'QD glute_max', 'adductors', 'CORE', 'Hold the bell by the horns at your chest; squat.'],
  ['kettlebell-clean-press', 'Kettlebell clean and press', 'kb clean and press', 'kettlebell', 'functional', 'Explosive', 'c', 'wr', 's', 'delt_front glute_max', 'TRI HM', 'CORE', 'Clean the bell to the rack position, then press overhead.'],
  ['kettlebell-snatch', 'Kettlebell snatch', 'kb snatch', 'kettlebell', 'functional', 'Explosive', 'c', 'wr', 's', 'glute_max HM delt_front', 'traps erectors', 'CORE FA', 'Swing the bell straight to overhead in one motion.'],
  ['box-jump', 'Box jump', 'box jumps', 'bodyweight', 'functional', 'Explosive', 'c', 'r', 'b', 'QD glute_max', 'CF HM', 'CORE', 'Swing the arms, jump up, land softly, step down.'],
  ['broad-jump', 'Broad jump', 'standing long jump', 'bodyweight', 'functional', 'Explosive', 'c', 'r', 'b', 'glute_max QD', 'HM CF', 'CORE', 'Jump forward as far as you can and stick the landing.'],
  ['medicine-ball-slam', 'Medicine ball slam', 'ball slam|med ball slam|slam ball', 'other', 'functional', 'Explosive', 'c', 'wr', 's', 'lats rectus_abdominis', 'delt_front TRI', 'QD:0.2', 'Reach high and slam the ball into the floor.'],
  ['jump-rope', 'Jump rope', 'skipping|skipping rope', 'other', 'functional', 'Conditioning', 'c', 'd', 'b', 'CF', 'QD:0.3', 'FA:0.2', 'Small bounces on the balls of your feet.'],
  ['rowing-machine', 'Rowing machine', 'rower|erg|row erg|ergometer', 'machine', 'functional', 'Conditioning', 'c', 'dd', 'b', 'lats QD', 'glute_max HM BICEPS', 'CORE', 'Legs, then hips, then arms; reverse on the way back.'],
  ['assault-bike', 'Air bike', 'assault bike|echo bike|fan bike', 'machine', 'functional', 'Conditioning', 'c', 'dd', 'b', 'QD', 'glute_max delt_front:0.3', '', 'Push and pull the handles while you pedal.'],
  ['bear-crawl', 'Bear crawl', 'bear crawls', 'bodyweight', 'functional', 'Conditioning', 'c', 'dd', 'b', 'delt_front QD', 'CORE TRI:0.3', '', 'Hands and feet, knees just off the floor; crawl.'],
];

// ---------- building the library ----------
const exParse = (spec) => {
  const out = {};
  for (const tok of String(spec || '').split(/\s+/).filter(Boolean)) {
    const [name, w] = tok.split(':');
    const ids = BUNDLES[name] ? BUNDLES[name].split(' ') : [name];
    for (const id of ids) out[id] = w !== undefined ? Number(w) : null;
  }
  return out;
};
const exWithRole = (spec, role) => Object.fromEntries(Object.entries(exParse(spec)).map(([id, w]) => [id, w ?? ROLE_WEIGHT[role]]));

function exFromRow([id, name, aka, equipment, category, pattern, mech, track, load, p, s, st, cue]) {
  const primary = exWithRole(p, 'primary');
  const secondary = exWithRole(s, 'secondary');
  const stabilisers = exWithRole(st, 'stabiliser');
  // A muscle only appears in its strongest role.
  for (const k of Object.keys(primary)) { delete secondary[k]; delete stabilisers[k]; }
  for (const k of Object.keys(secondary)) delete stabilisers[k];
  return {
    id, name, aka: aka ? aka.split('|') : [], equipment, category, pattern,
    mechanics: mech === 'c' ? 'compound' : 'isolation', track: TRACK_CODE[track], load: LOAD_CODE[load],
    muscles: { primary, secondary, stabilisers }, cue,
  };
}

export const BUILT_IN = ROWS.map(exFromRow);
let exAll = BUILT_IN.slice();
let exIndex = new Map();

// Names compare without case, punctuation, plurals or common shorthand (db, bb, kb).
export function exNorm(name) {
  return ` ${String(name || '').toLowerCase()} `
    .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/ db /g, ' dumbbell ').replace(/ bb /g, ' barbell ').replace(/ kb /g, ' kettlebell ')
    .replace(/ ez bar /g, ' ezbar ').replace(/ ez /g, ' ezbar ')
    .trim().split(/ +/).map(exSingular).join(' ');
}
function exSingular(w) {
  if (w.length < 3 || !w.endsWith('s') || /(ss|us|is)$/.test(w)) return w;
  return /(ch|sh|x)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
}
const exSlugName = (move) => (String(move).startsWith('x_') ? String(move).slice(2).replace(/-/g, ' ') : null);

function exReindex() {
  exIndex = new Map();
  for (const ex of exAll) {
    for (const n of [ex.name, ...ex.aka]) {
      const k = exNorm(n);
      if (k && !exIndex.has(k)) exIndex.set(k, ex);
    }
  }
}
exReindex();

export const allExercises = () => exAll;
export const exerciseById = (id) => exAll.find((e) => e.id === id) || null;

// The library record for a name the user typed or a stored key, or null.
export function findExercise(nameOrKey) {
  if (!nameOrKey) return null;
  const byId = exAll.find((e) => e.id === nameOrKey);
  if (byId) return byId;
  const slug = exSlugName(nameOrKey);
  return exIndex.get(exNorm(slug || nameOrKey)) || null;
}

// The user's own exercises join the library. Invalid ones are skipped, never thrown away.
export function setCustomExercises(list) {
  const custom = (Array.isArray(list) ? list : []).filter((e) => e && !e.deleted && !validateExercise(e).length).map((e) => ({ ...e, custom: true }));
  exAll = [...BUILT_IN, ...custom];
  exReindex();
}

// Problems with an exercise record, as plain sentences. Empty means valid.
export function validateExercise(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['Not an exercise.'];
  if (!e.id || !/^[a-z0-9_-]+$/.test(e.id)) errs.push('Missing id.');
  if (!String(e.name || '').trim()) errs.push('Give it a name.');
  if (!EQUIPMENT[e.equipment]) errs.push('Pick the equipment.');
  if (!CATEGORIES[e.category]) errs.push('Pick a category.');
  if (!TRACKS[e.track]) errs.push('Pick how it’s tracked.');
  if (!LOADS[e.load]) errs.push('Pick what the weight means.');
  const m = e.muscles || {};
  const p = Object.keys(m.primary || {});
  if (!p.length) errs.push('Pick at least one main muscle.');
  for (const role of ['primary', 'secondary', 'stabilisers']) {
    for (const [id, w] of Object.entries(m[role] || {})) {
      if (!MUSCLE_INFO[id]) errs.push(`Unknown muscle: ${id}.`);
      if (!(Number(w) > 0 && Number(w) <= 1)) errs.push(`Weight for ${id} must be between 0 and 1.`);
    }
  }
  if (TRACKS[e.track] && !TRACKS[e.track].fields.includes('kg') && e.load !== 'none') errs.push('Exercises without a weight use “Bodyweight only”.');
  return errs;
}

// How much one set loads each detailed muscle.
export function muscleWeights(ex) {
  const out = {};
  if (!ex) return out;
  for (const role of ['stabilisers', 'secondary', 'primary']) {
    for (const [id, w] of Object.entries(ex.muscles[role] || {})) out[id] = Math.max(out[id] || 0, Number(w) || 0);
  }
  return out;
}
// The same, rolled up to body-map groups (strongest detailed muscle wins).
export function groupWeights(ex) {
  const out = {};
  for (const [id, w] of Object.entries(muscleWeights(ex))) {
    const g = MUSCLE_INFO[id] && MUSCLE_INFO[id].group;
    if (g) out[g] = Math.max(out[g] || 0, w);
  }
  return out;
}
export const roleOf = (ex, muscle) => (ex.muscles.primary[muscle] ? 'primary' : ex.muscles.secondary[muscle] ? 'secondary' : ex.muscles.stabilisers[muscle] ? 'stabiliser' : null);
const exGroupsIn = (ex, roles) => new Set(roles.flatMap((r) => Object.keys(ex.muscles[r] || {})).map((id) => MUSCLE_INFO[id] && MUSCLE_INFO[id].group));

// Tags shown in the library and usable as the "type" filter.
export function exerciseTypes(ex) {
  const t = [ex.mechanics === 'compound' ? 'Compound' : 'Isolation'];
  if (ex.track === 'duration' || ex.track === 'weight_duration' || ex.track === 'distance_duration') t.push('Timed');
  if (TRACKS[ex.track].fields.includes('kg') && ex.load !== 'assisted') t.push('Weighted');
  if (ex.equipment === 'bodyweight') t.push(ex.category === 'functional' ? 'Calisthenics' : 'Bodyweight');
  if (ex.equipment === 'band') t.push('Band');
  if (ex.category === 'functional' || ex.pattern === 'Carry' || ex.pattern === 'Explosive') t.push('Functional');
  if (ex.category === 'core') t.push('Core');
  return t;
}
export const EXERCISE_TYPES = ['Compound', 'Isolation', 'Weighted', 'Bodyweight', 'Calisthenics', 'Band', 'Timed', 'Functional', 'Core'];

// Search by name, other names, muscles, equipment or movement, with filters.
export function searchExercises(query = '', f = {}) {
  const q = exNorm(query);
  const words = q ? q.split(' ') : [];
  const out = [];
  for (const ex of exAll) {
    if (f.equipment && ex.equipment !== f.equipment) continue;
    if (f.fits && !equipmentFits(ex, f.fits)) continue;
    if (f.category && ex.category !== f.category) continue;
    if (f.mechanics && ex.mechanics !== f.mechanics) continue;
    if (f.type && !exerciseTypes(ex).includes(f.type)) continue;
    if (f.group && !exGroupsIn(ex, f.role ? [f.role === 'stabiliser' ? 'stabilisers' : f.role] : ['primary', 'secondary']).has(f.group)) continue;
    if (f.muscle) {
      const role = roleOf(ex, f.muscle);
      if (!role || (f.role && role !== f.role)) continue;
    }
    let score = 1;
    if (words.length) {
      const names = [ex.name, ...ex.aka].map(exNorm);
      const hay = `${names.join(' ')} ${ex.equipment} ${ex.category} ${exNorm(ex.pattern)} ${Object.keys(muscleWeights(ex)).map((id) => exNorm(MUSCLE_INFO[id].label)).join(' ')}`;
      if (names.includes(q)) score = 100;
      else if (names.some((n) => n.startsWith(q))) score = 80;
      else if (words.every((w) => names.some((n) => n.split(' ').some((t) => t.startsWith(w))))) score = 60;
      else if (words.every((w) => hay.includes(w))) score = 30;
      else continue;
    }
    out.push({ ex, score });
  }
  return out.sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name)).map((x) => x.ex);
}

// Exercises that share names closely enough to be the same thing (to stop duplicates).
export function similarExercises(name, limit = 3) {
  const q = exNorm(name);
  if (!q) return [];
  const exact = findExercise(name);
  if (exact) return [exact];
  const qs = new Set(q.split(' '));
  return exAll.map((ex) => {
    const best = Math.max(...[ex.name, ...ex.aka].map((n) => {
      const t = new Set(exNorm(n).split(' '));
      const both = [...qs].filter((w) => t.has(w)).length;
      return both / new Set([...qs, ...t]).size;
    }));
    return { ex, best };
  }).filter((x) => x.best >= 0.6).sort((a, b) => b.best - a.best).slice(0, limit).map((x) => x.ex);
}

// A starting point for a new exercise's muscles, from the closest-sounding library exercise.
export function suggestMapping(name) {
  const words = exNorm(name).split(' ').filter((w) => w.length > 2);
  if (!words.length) return null;
  let best = null;
  for (const ex of BUILT_IN) {
    const t = new Set([ex.name, ...ex.aka].flatMap((n) => exNorm(n).split(' ')));
    const hits = words.filter((w) => t.has(w)).length;
    if (hits && (!best || hits > best.hits)) best = { ex, hits };
  }
  return best ? best.ex : null;
}

// Swaps that train the same main muscles in a similar way, with kit the athlete has.
export function alternativesFor(ex, { fits = 'gym', exclude = [], limit = 6 } = {}) {
  if (!ex) return [];
  const mine = muscleWeights(ex);
  const prim = Object.keys(ex.muscles.primary);
  const skip = new Set([ex.id, ...exclude.map((n) => (findExercise(n) || {}).id).filter(Boolean)]);
  const scored = [];
  for (const o of exAll) {
    if (skip.has(o.id) || !equipmentFits(o, fits)) continue;
    const theirs = muscleWeights(o);
    const primOverlap = prim.filter((id) => o.muscles.primary[id]).length / prim.length;
    if (primOverlap === 0) continue;
    let shared = 0;
    let total = 0;
    for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      shared += Math.min(mine[id] || 0, theirs[id] || 0);
      total += Math.max(mine[id] || 0, theirs[id] || 0);
    }
    const score = primOverlap * 2 + shared / total + (o.pattern === ex.pattern ? 0.8 : 0) + (o.mechanics === ex.mechanics ? 0.3 : 0);
    scored.push({ o, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.o);
}

// ---------- sets ----------
export const trackOf = (ex) => (ex && TRACKS[ex.track] ? ex.track : 'weight_reps');
// Seconds for a timed set. Older logs stored a plank's seconds in the reps box.
export const secOf = (set, track) => {
  if (!set) return 0;
  if (set.sec !== undefined && set.sec !== '') return Number(set.sec) || 0;
  return track === 'duration' || track === 'weight_duration' ? Number(set.reps) || 0 : 0;
};
// Weight moved in one set, in kg: pairs of dumbbells count twice, assistance counts as nothing.
// Only weight-and-reps exercises have volume; timed and distance work is tracked on its own terms.
export function volumeOf(set, ex) {
  const kg = Number(set && set.kg) || 0;
  const reps = Number(set && set.reps) || 0;
  if (!ex) return kg * reps;
  if (ex.track !== 'weight_reps' && ex.track !== 'reps') return 0;
  if (ex.load === 'assisted') return 0;
  return kg * reps * (ex.load === 'pair' ? 2 : 1);
}

// ---------- what a stored key means ----------
// The app tells the library how to turn a logged key (a movement slot or an exercise key) into a name.
let exMoveName = (move) => exSlugName(move) || move;
export function setMoveResolver(fn) { exMoveName = fn; }
export function exerciseForMove(move, name) {
  return findExercise(name) || findExercise(exMoveName(move)) || findExercise(move);
}

// Seconds or reps a prescription asks for, e.g. "30–45s" -> 30 seconds.
export function targetOf(reps) {
  const s = String(reps || '');
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (/s\b|sec|min/.test(s)) return { sec: /min/.test(s) ? (nums[0] || 1) * 60 : nums[0] || 30 };
  if (/m\b|metre|meter/.test(s)) return { m: nums[0] || 20 };
  return { reps: nums[0] || 8, high: nums[nums.length - 1] || nums[0] || 8 };
}
