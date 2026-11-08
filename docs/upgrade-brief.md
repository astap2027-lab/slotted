# SLOTTED — EXISTING SOFTWARE UPGRADE

## Project objective

I have an existing, functioning fitness application called **Slotted**. I love its current branding, design, homepage, navigation and overall functionality.

I want to upgrade the existing software with four major improvements:

1. A more intelligent and adaptable training timetable.
2. Fatigue-aware workout scheduling.
3. More detailed muscle-specific fatigue tracking.
4. A significantly larger exercise database with flexible exercise tracking.

**IMPORTANT: Do not rebuild the application or redesign it from scratch. This is an upgrade to existing software.**

Before making changes, inspect the current codebase, database, components, scheduling system, exercise tracking and fatigue calculations. Understand how everything currently works.

Preserve all existing features, user data, workout history, routines and visual styling. Extend the existing architecture wherever possible.

---

## 1. Intelligent and adaptable timetable

I want users to have much greater control over their weekly availability.

The AI should understand natural-language instructions and automatically adjust the timetable.

For example:
- "I finish school at 1:05 pm every Tuesday."
- "I start school at 9:40 am on Fridays."
- "I have basketball training on Thursday from 4–6 pm."
- "I cannot train this Saturday."
- "I have more free time on Wednesday mornings."

Support:
- Different daily schedules.
- Week A and Week B.
- Fortnightly and rotating schedules.
- Recurring commitments.
- One-off exceptions.
- School and work schedules.
- Fixed and flexible activities.
- Travel and preparation time.

Allow users to manually add, edit, delete and move commitments.

The system must distinguish between fixed commitments that cannot be moved and flexible activities such as gym sessions.

Users should also be able to lock individual workouts so AI cannot move them without permission.

The existing weekly timetable should remain, but become more adaptable and intelligent.

All changes must update the relevant parts of the application.

---

## 2. Intelligent fatigue-aware scheduling

Make muscle fatigue and overall physical fatigue active parts of the scheduling engine.

Slotted should understand not only when someone is available to train, but also when it makes sense to train.

### Muscle fatigue

Use the existing fatigue calculation system as the foundation.

Consider:
- Muscles trained.
- Exercises performed.
- Sets and repetitions.
- Weight used.
- Training intensity.
- Proximity to failure.
- Time since training.
- Recent training volume.

### Overall fatigue

Introduce an optional, quick daily check-in where users can record:
- Energy levels.
- General tiredness.
- Sleep duration.
- Sleep quality.
- General soreness.
- Perceived stress.
- Overall readiness.

Keep this simple and optional.

### Intelligent adjustments

The AI should use availability, muscle recovery and overall fatigue to suggest appropriate changes.

For example:

"My legs are still sore and I'm feeling exhausted. Can you reorganise the rest of my week?"

Slotted should consider moving workouts, swapping sessions, reducing training volume or suggesting recovery time.

Another example:

"My biceps are fatigued, but my legs are recovered."

The system should recognise that these muscle groups have different recovery statuses and consider an alternative session.

When suggesting changes:
- Explain why the adjustment is recommended.
- Show which workouts will move.
- Preserve fixed commitments.
- Avoid unnecessary changes.
- Ask for approval before modifying the existing timetable.

Allow users to accept or reject proposed changes.

Do not present fatigue percentages as medical measurements or diagnose injuries. They are estimates based on recorded training and user feedback.

---

## 3. More detailed muscle fatigue tracking

I really like the appearance of the existing muscle fatigue chart. Preserve its visual design, but make the underlying muscle categories significantly more specific.

Currently, the system groups muscles too broadly, for example displaying "Legs".

I want individual muscle groups tracked separately.

### Muscle groups to support

**Chest**
- Pectoralis major.
- Upper chest.
- Mid and lower chest emphasis.

**Back**
- Latissimus dorsi.
- Trapezius.
- Rhomboids.
- Spinal erectors.

**Shoulders**
- Anterior deltoids.
- Lateral deltoids.
- Posterior deltoids.

**Arms**
- Biceps brachii.
- Brachialis.
- Triceps brachii, including all three heads.
- Forearm flexors and extensors.
- Brachioradialis.

**Quadriceps**
- Rectus femoris.
- Vastus lateralis.
- Vastus medialis.
- Vastus intermedius.

**Hamstrings**
- Biceps femoris.
- Semitendinosus.
- Semimembranosus.

**Glutes**
- Gluteus maximus.
- Gluteus medius.
- Gluteus minimus.

**Calves**
- Gastrocnemius.
- Soleus.

**Additional lower body**
- Hip flexors.
- Adductors.
- Abductors.
- Tibialis anterior.

**Core**
- Rectus abdominis.
- Internal and external obliques.
- Transverse abdominis.
- Quadratus lumborum.

### Interactive muscle chart

Retain the existing visual muscle diagram and introduce:
- Front and back views.
- Individual selectable muscles.
- Colour-coded fatigue indicators.
- Expandable muscle categories.
- Individual recovery information.
- Recent exercises and training history.
- Recent volume and recovery trends.

For example, quadriceps and hamstrings must have entirely separate recovery information.

When a user selects an individual muscle, show its estimated freshness, recent exercises, training dates and relevant recovery information.

The interface should remain clean and uncluttered.

---

## 4. Comprehensive exercise library

Significantly expand the existing exercise database.

I want users to be able to build almost any common gym routine without being restricted by a small selection of pre-programmed exercises.

Build an actual searchable and expandable exercise database, not just a list in the AI's instructions.

Include a broad selection of:

- Barbell exercises.
- Dumbbell exercises.
- Cable exercises.
- Machine exercises.
- Bodyweight exercises.
- Resistance band exercises.
- Calisthenics.
- Compound movements.
- Isolation exercises.
- Functional exercises.
- Core exercises.
- Timed exercises.
- Weighted exercises.

### Exercise categories and examples

**Chest:** Bench press, incline bench press, dumbbell press, chest fly, cable fly, pec deck, chest press, push-ups and dips.

**Back:** Deadlifts, barbell rows, dumbbell rows, T-bar rows, lat pulldowns, cable rows, pull-ups, chin-ups and straight-arm pulldowns.

**Shoulders:** Overhead press, Arnold press, lateral raises, front raises, rear delt fly, face pulls, cable raises and machine shoulder press.

**Biceps:** Barbell curls, EZ-bar curls, hammer curls, incline curls, preacher curls, concentration curls, cable curls and reverse curls.

**Triceps:** Pushdowns, rope extensions, overhead extensions, skull crushers, kickbacks, close-grip bench press and dips.

**Quadriceps:** Squats, front squats, leg press, hack squats, Bulgarian split squats, lunges, step-ups and leg extensions.

**Hamstrings:** Romanian deadlifts, stiff-leg deadlifts, leg curls, Nordic curls, glute-ham raises and good mornings.

**Glutes:** Hip thrusts, glute bridges, kickbacks, cable pull-throughs, lunges, step-ups and hip abduction exercises.

**Calves:** Standing calf raises, seated calf raises, donkey raises and tibialis raises.

**Core:** Planks, side planks, hanging leg raises, crunches, cable crunches, ab wheel rollouts, Russian twists, dead bugs, Pallof presses and mountain climbers.

**Forearms and grip:** Wrist curls, reverse curls, farmer's carries, dead hangs, plate pinches and wrist rollers.

**Functional training:** Kettlebell swings, farmer's carries, sled pushes, battle ropes, Turkish get-ups, burpees, cleans and thrusters.

This should be an initial catalogue, not a limit. Add common variations and allow the library to expand over time.

### Exercise database information

Every exercise should have a structured record containing:
- Exercise name.
- Alternative names.
- Equipment required.
- Exercise category.
- Movement pattern.
- Primary muscles.
- Secondary muscles.
- Stabilising muscles.
- Exercise tracking type.
- Instructions and technique information.

### Muscle mapping

Every exercise must be linked to the detailed muscle fatigue system.

For example:

**Bench press**
- Primary: Pectoralis major.
- Secondary: Triceps and anterior deltoids.

**Lateral raise**
- Primary: Lateral deltoids.
- Secondary: Other relevant shoulder stabilisers.

**Romanian deadlift**
- Primary: Hamstrings and gluteus maximus.
- Secondary: Spinal erectors and relevant hip stabilisers.

**Leg extension**
- Primary: Quadriceps.

**Leg curl**
- Primary: Hamstrings.

Differentiate primary, secondary and stabilising involvement.

Use configurable weighted contributions to inform fatigue calculations. Do not assume every involved muscle receives identical fatigue.

### Exercise searching and filtering

Allow users to search and filter by:
- Exercise name.
- Muscle group.
- Equipment.
- Primary muscle.
- Secondary muscle.
- Compound or isolation.
- Exercise type.

Recognise common exercise names, variations and abbreviations.

### Custom exercises

Allow users to create their own exercises.

They should be able to enter the name, equipment, muscle groups and tracking type.

AI can suggest the relevant muscle mapping, but users should be able to review and confirm it.

Prevent unnecessary duplicate exercises by recognising alternative names.

### Exercise alternatives

Provide suitable alternatives for every exercise where possible.

For example, a user who cannot perform barbell bench press should be able to find suitable dumbbell, machine or bodyweight alternatives.

The AI should prioritise similar primary muscles and movement patterns.

When an exercise is replaced, update the muscle mapping appropriately.

---

## 5. Advanced exercise tracking

Expand the workout tracking system so users can record more than repetitions.

Every exercise should support an appropriate tracking format.

### Tracking types

**A. Repetitions**

For bodyweight and repetition-based exercises.

**B. Weight and repetitions**

For exercises such as bench press, squats and dumbbell curls.

Allow individual weight and repetition entries for every set.

**C. Duration**

For exercises such as:
- Planks.
- Wall sits.
- Dead hangs.
- Static holds.

Allow users to record seconds or minutes.

**D. Weight and duration**

For weighted planks, weighted holds and loaded carries.

**E. Distance and duration**

For exercises such as farmer's carries and other distance-based movements.

### Timer functionality

For duration-based exercises, include an integrated timer with:
- Start.
- Pause.
- Resume.
- Reset.
- Automatic recording of completed duration.
- Manual duration entry.

Make the timer large and easy to operate during training.

### Weight tracking

Support:
- Kilograms and pounds.
- Different weights for individual sets.
- Dumbbells.
- Barbells.
- Machines.
- Cable equipment.
- Weighted bodyweight exercises.
- Assisted exercises.

Clearly distinguish between weight per hand, combined weight and total load.

### Progress tracking

Track progress appropriately for each exercise type.

For example:
- Bench press: weight and repetitions.
- Plank: duration.
- Farmer's carry: weight and distance.

Preserve previous exercise history and existing records.

Do not compare different tracking types as though they measure the same thing.

---

## 6. Integration between all features

All the new systems must communicate with one another.

This is essential.

For example:

1. A user schedules a leg workout for Wednesday.
2. The exercises include squats, leg extensions and Romanian deadlifts.
3. Slotted identifies the primary and secondary muscles involved.
4. The user completes the workout and records their weights and repetitions.
5. The individual quadriceps, hamstrings and glutes fatigue estimates update.
6. The user reports low energy and poor sleep the following day.
7. Slotted considers this information when assessing the next workout.
8. If an adjustment is appropriate, the AI proposes an alternative schedule.
9. The user accepts the change and the weekly timetable updates.

The timetable, exercise library, workout history, progress tracking, AI coach and fatigue system should all use consistent underlying data.

---

## 7. Preserve the existing design and functionality

I love the current Slotted interface. Keep its branding, colour palette, homepage, navigation, dashboard and overall visual identity.

Do not introduce an entirely different design.

Make the new features feel like natural extensions of the existing application.

Keep the interface organised and easy to navigate, particularly during gym sessions.

**Do not remove or break:**
- Homepage and dashboard.
- Weekly timetable.
- Week A and Week B functionality.
- Workout routines.
- Workout completion.
- Exercise history.
- Progress charts.
- Muscle fatigue chart.
- AI coach.
- Settings.
- Existing saved data.

Before modifying the database, inspect its existing structure.

If changes are necessary, use safe migrations and preserve historical information.

Do not reset, overwrite or discard existing workouts or user records.

---

## 8. Technical and testing requirements

Implement the new functionality inside the existing architecture.

Use stable exercise and muscle identifiers so the systems remain consistent.

Perform calculations through application logic rather than relying on AI-generated arithmetic.

Validate exercise records, muscle mappings, weight calculations and schedule changes.

Test that:

- Week A and Week B schedules still work.
- Natural-language availability changes update the timetable.
- Fixed commitments remain protected.
- Fatigue-aware suggestions consider individual muscles and overall fatigue.
- Quadriceps and hamstrings recover independently.
- Compound exercises update relevant primary and secondary muscles.
- The exercise database is actually searchable and usable in the workout builder.
- Custom exercises can be created.
- Weight, repetition and duration tracking all work.
- Historical workout records remain intact.
- The AI coach can access the updated information.
- All existing functionality continues working.

No decorative or non-functional buttons. No superficial placeholder features.

# FINAL OBJECTIVE

I want Slotted to become a genuinely intelligent fitness scheduling and tracking platform.

It should understand a user's weekly availability, organise workouts around their lifestyle, consider their recovery, recognise individual muscles, support an extensive range of exercises and accurately track different types of training.

**Upgrade the existing Slotted application. Do not start again. Preserve what works, improve what is missing and make all the new features work together.**