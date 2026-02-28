# Prompt per Agente Replit

> Copia tutto il testo qui sotto e incollalo nell'agente Replit

---

## PROMPT DA COPIARE:

```
I need you to set up this React Native / Expo project on Replit so I can develop it from my phone using Expo Go.

The GitHub repo is: https://github.com/JackBlack000X/Omnia-vera

Here is everything you need to do:

---

### 1. CLONE THE REPO
Clone the GitHub repository into this Repl. Make sure git is configured so I can pull from different branches later.

---

### 2. SET NODE VERSION
This project requires Node.js 20 or 22. Make sure the correct version is set. If using Nix, configure replit.nix accordingly. If using package.json engines, respect that.

---

### 3. INSTALL DEPENDENCIES
Run:
  npm install

Do NOT run npm audit fix or change any package versions. The versions in package-lock.json must be respected exactly.

---

### 4. MAKE SCRIPTS EXECUTABLE
Run:
  chmod +x auto-pull.sh start-dev.sh

---

### 5. CREATE THE .replit CONFIG FILE
Create a `.replit` file at the root with this content:

  run = "bash start-dev.sh main"
  entrypoint = "start-dev.sh"

  [nix]
  channel = "stable-24_05"

  [env]
  EXPO_NO_DOTENV = "1"

  [[ports]]
  localPort = 8081
  externalPort = 8081

---

### 6. CREATE THE replit.nix FILE
Create a `replit.nix` file at the root with this content:

  { pkgs }: {
    deps = [
      pkgs.nodejs_22
      pkgs.nodePackages.npm
    ];
  }

---

### 7. CONFIGURE GIT FOR AUTO-PULL
Make sure git fetch works without credentials being required every time.
If the repo is public, no credentials are needed.
If private, help me set up a GitHub Personal Access Token as a Replit Secret called GITHUB_TOKEN, and configure git to use it:
  git remote set-url origin https://$GITHUB_TOKEN@github.com/JackBlack000X/Omnia-vera.git

Also run:
  git config pull.rebase false
  git config --global user.email "replit@dev.local"
  git config --global user.name "Replit Dev"

---

### 8. VERIFY THE SETUP
Run a quick check:
  node --version
  npx expo --version
  git remote -v
  git branch -a

Everything should show without errors.

---

### 9. IMPORTANT NOTES
- Do NOT run `expo start` yet — I will do that manually when needed
- Do NOT modify any source files (app/, components/, hooks/, lib/)
- Do NOT change package.json or any config files other than what is listed above
- The app uses @shopify/react-native-skia and react-native-reanimated — these are already in package.json and should install fine with npm install
- The project uses expo-router with file-based routing

---

### 10. FINAL SUMMARY
When done, tell me:
1. Confirm all steps completed successfully
2. Show me the output of `npx expo --version`
3. Tell me exactly what command to run to start the dev server with tunnel

The command I expect to use is:
  bash start-dev.sh main
or for a specific branch:
  bash start-dev.sh preview/nome-feature
```

---

## Come usarlo

1. Su Replit, crea un nuovo Repl (tipo "Node.js" o "Blank")
2. Apri l'agente AI di Replit
3. Copia tutto il testo dentro il box `PROMPT DA COPIARE` qui sopra
4. Incollalo nell'agente e manda
5. Lascia che l'agente faccia tutto
6. Quando ha finito, prova a lanciare: `bash start-dev.sh main`
7. Scansiona il QR che appare con Expo Go

## Workflow dopo il setup

Ogni volta che vuoi testare una modifica:
- Io pusho su una branch (es. `preview/nuova-funzione`)
- Tu lanci: `bash start-dev.sh preview/nuova-funzione`
- Expo Go si aggiorna automaticamente ogni 10 secondi
- Ti piace? → dimmelo e mergo su main
- Non ti piace? → dimmelo e cancello la branch
