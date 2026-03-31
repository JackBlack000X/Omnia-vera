## Background location & geofenced tasks – Design

**Goal:** Allow Tothemoon to know the user location (with permission) and offer extra features:
- background-capable geofenced tasks (e.g. "Palestra" auto-completes when user exits a 200m radius)
- clear separation: app fully usable without location, but extras are disabled without permission

**Key decisions:**
- Use **geofencing (Approach A)** as the main mechanism, with a small part of **Approach C** only when we later add weather-based logic.
- Do **not** implement continuous GPS tracking; we rely on OS-level geofence enter/exit callbacks for battery efficiency.
- Ask for location permission explicitly from **Profilo → Impostazioni → Automazioni posizione** and from "Places" UX if needed.
- Design the data model now (places + geofenced auto-complete options) and wire basic permission flows, keeping weather out of scope for this iteration.

### 1. Permissions & platform behaviour

- **Permissions required:**
  - iOS:
    - When-in-use: for any foreground map / place picking.
    - Always / "Allow all the time": required so geofences trigger when app is closed. We surface this via a clear explanation in Italian.
  - Android:
    - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
    - `ACCESS_BACKGROUND_LOCATION` for geofence events while app is backgrounded.
- **User experience:**
  - App must remain **fully usable without location**:
    - All current task/habit features work with no change.
    - New geofenced extras are visually marked as **"richiede posizione"** and disabled/greyed-out when permission is missing.
  - Permission prompts:
    - We never hard-block core flows behind location.
    - We provide:
      - A global toggle / card in Profilo to enable "Automazioni posizione" and request permission.
      - Contextual prompts when configuring a Place or geofenced rule.

### 2. Data model

We introduce two concepts: **Place** and **auto-complete rules** attached to a Habit.

- **Place** (user-defined location):
  - `id: string`
  - `name: string` – e.g. "Palestra", "Ufficio"
  - `lat: number`
  - `lng: number`
  - `radiusMeters: number` – default 200

Storage strategy:
- Stored alongside other Tothemoon persisted state (AsyncStorage), likely in a `lib/places` module.
- Small list (dozens), so simple JSON blob is fine.

- **Habit auto-complete (location-based):**
  - Extend `Habit` with an optional field, e.g.:
    - `locationRule?: {`
    - `  type: 'geofenceExit';`
    - `  placeId: string;`
    - `  minOutsideMinutes?: number; // anti-jitter`
    - `}`
  - For now we support only:
    - **type = 'geofenceExit'** → when user leaves the place radius and stays outside for `minOutsideMinutes`, we mark the habit as **completed for today**.

Behavioural rules:
- Inner logic:
  - A geofence exit event arrives with region identifier mapping to a `placeId`.
  - We map `placeId → all habits that reference that place with `type: 'geofenceExit'`.
  - For each relevant habit:
    - If "today" is a day in which the habit should appear (same logic as event auto-completion), we mark it completed for today's logical date, after applying anti-jitter.
- Anti-jitter:
  - We may receive noisy enter/exit if GPS bounces around the radius edge.
  - We only confirm an "exit" as valid if the user stays outside the radius for at least `minOutsideMinutes` (e.g. 2–5 minutes).
  - Implementation detail lives in the background task handler.

### 3. UX – Places management

#### 3.1 Entry point

- In **Tasks tab**, the progress bar already has a 3-dot options menu.
- The user requested: "nei 3 puntini aggiungiamo una icona di una mappa per mettere i posti".
- We will:
  - Add a new option in the options menu with a **map/pin icon** and label like **"Gestisci luoghi"**.
  - This opens a simple Places management screen/modal (or a full-screen route) where the user can:
    - See list of saved Places.
    - Add a new Place.
    - Edit/delete existing Places.

#### 3.2 Places screen (MVP)

For this iteration we keep it simple (no full map picker yet, we can start with coordinates fields or a basic UI):

- List of current Places with:
  - name
  - radius (e.g. "200 m")
  - small status icon if location permission is off (e.g. warning icon).
- "Aggiungi luogo" button:
  - For now, we can use a basic form:
    - name (required)
    - latitude (number)
    - longitude (number)
    - radius (slider or numeric, default 200m)
  - Later this can become a real map picker without changing backend/data model.

### 4. UX – Linking a Habit to a Place

We integrate Place selection when creating/editing a Habit:

- In the existing `ModalScreen` (type `new` or `edit`):
  - After schedule/time sections, add a new block for **"Automazioni"** visible when:
    - `tipo === 'task'` (for now) and
    - location features are globally enabled (permission granted).
  - Inside the block:
    - Toggle or chip: **"Completa automaticamente in base alla posizione"**.
    - Dropdown/list to pick a `Place` (from Places list).
    - For now we hard-code rule type:
      - `Regola: "Completa quando esco dal raggio"` (your choice B).
    - Optionally a small sublabel: "Richiede posizione sempre attiva".

If the user has no Places yet:
- Show info text: "Nessun luogo salvato" with a CTA to open "Gestisci luoghi".

If location permission is denied:
- Show a disabled state:
  - Text: "Per usare le automazioni posizione, abilita la posizione nelle impostazioni"
  - Button: "Apri impostazioni posizione" that navigates to Profilo → Automazioni posizione.

### 5. Profile screen – global location controls

In `Profilo → Impostazioni` we add a box similar to the Apple Calendar section:

- Title: **"Automazioni posizione"**
- Subtitle: "Usa la posizione per completare automaticamente alcune task (es. Palestra) quando esci da un luogo."
- Content:
  - Status line, e.g.:
    - "Stato: Attivo" / "Stato: Solo in primo piano" / "Stato: Disattivato"
  - Primary button:
    - If permission not requested or denied:
      - "Abilita posizione in background"
    - If only foreground granted:
      - "Estendi a posizione sempre attiva"
    - If fully granted:
      - "Gestisci luoghi" (shortcut to Places screen).
- Behaviour:
  - Tapping the button uses our location helper (`lib/location`) to request the appropriate permission.
  - After the prompt, we update internal stored status and re-render.

### 6. Location helper module

We create `lib/location.ts` as a single, testable place for:

- `canAskLocationPermission(): boolean` – true only on iOS/Android.
- `getLocationPermissionStatusAsync(): Promise<'none' | 'foreground' | 'background' | 'denied'>`
  - Wraps Expo Location APIs (`getForegroundPermissionsAsync`, `getBackgroundPermissionsAsync`).
- `requestLocationPermissionsAsync(kind: 'foreground' | 'background'): Promise<'foreground' | 'background' | 'denied'>`
  - foreground: ask for when-in-use only.
  - background: ensure foreground is granted, then request background.
- (Future) geofence registration helpers:
  - `registerGeofencesForPlaces(places: Place[]): Promise<void>`
  - `clearAllGeofences(): Promise<void>`

For this iteration we implement:
- Permissions helpers and status mapping.
- Basic scaffolding for geofence registration (function signatures and no-op or TODO bodies), so that future work can plug into them without API changes.

### 7. Background geofencing logic (scaffold only)

Because full background task wiring is non-trivial and touches app entrypoint routing, for this iteration we only **prepare the surfaces**:

- Define a `TASK_GEOFENCE_NAME` constant in `lib/location.ts`.
- Export stubs:
  - `startGeofencingForPlaces(places: Place[]): Promise<void>`
  - `stopGeofencing(): Promise<void>`
- Document (in comments in that file) that they must:
  - Register background task with Expo Task Manager.
  - On geofence enter/exit, call into a pure function that:
    - Receives (`eventType`, `placeId`, timestamp).
    - Decides which habits to complete based on `Habit.locationRule`.

The current iteration will not flip completion yet; the main user-facing part is:
- the app "sa la posizione" with correct permission flow.
- the user can manage Places and attach them to tasks.
- extra UI is clearly marked as requiring location and stays disabled when permission is off.

### 8. Behaviour when location is off

- If the user never grants location:
  - Existing flows are unchanged.
  - Places and automations UI:
    - Visible, but marked as "richiede posizione".
    - Actions to edit/list credentials still allowed, but they simply won’t run background logic.
- If the user later revokes location from system settings:
  - On next app open or when we detect permission change, we:
    - Update status to "Disattivato".
    - Keep Places and `locationRule` configs persisted (so they come back if permission is re-enabled).
    - Stop any active geofencing (once we implement it).
