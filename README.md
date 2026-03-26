# The Chase Quiz App

A simple, responsive web application inspired by ITV's "The Chase" built with Vite + React + Vanilla CSS. 
It supports multiple input modes (Typing or Party Mode), customizable timers, and loads its content via JSON.

## Playing the Quiz

You can load custom questions by providing a URL to a JSON payload via the `?quiz=` query parameter.
```
http://your-domain.com/index.html?quiz=https://your-raw-json-url.json
```
If no parameter is provided, the app will automatically load `default_questions.json` bundled in the public directory.

## JSON Structure Requirements
See `public/default_questions.json` for the exact schema. It controls settings like time, party mode, and chaser difficulty.

## How to Deploy to GitHub Pages

1. **Build the project:**
   Run `npm run build` in the repository root. This will generate a `dist` folder.
   
2. **Push Code to GitHub:**
   Commit this code and push it to a new GitHub repository.
   
3. **Configure GitHub Pages:**
   - Go to your repository settings on GitHub.
   - Select "Pages" on the left sidebar.
   - Set the source to GitHub Actions or select your branch. 
   *(Alternatively, deploy the `dist` folder to gh-pages branch manually or via an action).*

4. **Testing Locally:**
   Use `npm run dev` to see the live reloading server on your phone or computer.
