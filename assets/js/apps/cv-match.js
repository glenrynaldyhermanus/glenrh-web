/**
 * CV Match: finds known tech skills in a job post and a CV, then scores the fit.
 * Everything runs locally; nothing is sent anywhere.
 */

const SKILLS = {
  "JavaScript": ["javascript", "js", "es6", "ecmascript"],
  "TypeScript": ["typescript", "ts"],
  "Node.js": ["node.js", "nodejs", "node"],
  "Express": ["express", "express.js"],
  "React": ["react", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  "Vue": ["vue", "vue.js", "vuejs", "nuxt"],
  "Svelte": ["svelte", "sveltekit"],
  "Angular": ["angular"],
  "HTML": ["html", "html5"],
  "CSS": ["css", "css3", "sass", "scss"],
  "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
  "Go": ["go", "golang"],
  "Python": ["python"],
  "Django": ["django"],
  "FastAPI": ["fastapi"],
  "Java": ["java"],
  "Spring": ["spring", "spring boot", "springboot"],
  "Kotlin": ["kotlin"],
  "Swift": ["swift"],
  "SwiftUI": ["swiftui"],
  "Jetpack Compose": ["jetpack compose", "compose"],
  "Android": ["android"],
  "iOS": ["ios"],
  "Flutter": ["flutter"],
  "Dart": ["dart"],
  "React Native": ["react native"],
  "PHP": ["php"],
  "Laravel": ["laravel"],
  "Ruby on Rails": ["rails", "ruby on rails"],
  "C#": ["c#", "csharp"],
  ".NET": [".net", "dotnet", "asp.net"],
  "Rust": ["rust"],
  "SQL": ["sql"],
  "PostgreSQL": ["postgresql", "postgres", "psql"],
  "MySQL": ["mysql", "mariadb"],
  "MongoDB": ["mongodb", "mongo"],
  "Redis": ["redis"],
  "Elasticsearch": ["elasticsearch", "elastic"],
  "Kafka": ["kafka"],
  "RabbitMQ": ["rabbitmq"],
  "Prisma": ["prisma"],
  "GraphQL": ["graphql"],
  "REST API": ["rest api", "rest apis", "restful", "rest/json"],
  "gRPC": ["grpc"],
  "WebSockets": ["websocket", "websockets"],
  "Microservices": ["microservices", "microservice"],
  "Docker": ["docker", "containers"],
  "Kubernetes": ["kubernetes", "k8s"],
  "Terraform": ["terraform"],
  "AWS": ["aws", "amazon web services"],
  "GCP": ["gcp", "google cloud"],
  "Azure": ["azure"],
  "Firebase": ["firebase"],
  "Linux": ["linux"],
  "Nginx": ["nginx"],
  "CI/CD": ["ci/cd", "cicd", "continuous integration", "github actions", "gitlab ci", "jenkins"],
  "Git": ["git", "github", "gitlab"],
  "Unit testing": ["unit test", "unit tests", "unit testing", "jest", "vitest", "junit", "testing"],
  "Playwright": ["playwright", "cypress", "e2e"],
  "System design": ["system design", "architecture", "scalability"],
  "Figma": ["figma"],
  "UI/UX": ["ui/ux", "ux", "user experience", "ui design"],
  "Machine learning": ["machine learning", "ml", "pytorch", "tensorflow"],
  "LLMs": ["llm", "llms", "openai", "gemini", "langchain", "prompt engineering", "generative ai"],
  "n8n": ["n8n", "zapier", "make.com"],
  "Agile": ["agile", "scrum", "kanban"],
  "English": ["english"]
};

const SAMPLE_JD = `Middle Backend Engineer (3+ years)

We're looking for a backend engineer to build the services behind our mobile app.
You will design REST APIs in Go, model data in PostgreSQL and keep things fast with Redis.
Our services ship in Docker containers to Kubernetes through GitHub Actions.
Nice to have: gRPC, Kafka and some experience with system design.
Good written English and comfort working in an agile team.`;

const SAMPLE_CV = `Sari Wulandari, Backend Developer
Jakarta, Indonesia. 4 years of experience.

Built and maintained Go microservices for a payments startup, exposing REST APIs to Android and iOS apps.
Designed PostgreSQL schemas, wrote migrations and tuned slow queries. Added Redis caching for hot reads.
Packaged services with Docker and set up CI/CD with GitHub Actions.
Also comfortable with Linux, Nginx and a bit of Python for scripts.`;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); }

const MATCHERS = Object.entries(SKILLS).map(function ([name, aliases]) {
  const alts = aliases.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRe).join("|");
  return { name, re: new RegExp("(?<![a-z0-9+#.])(?:" + alts + ")(?![a-z0-9+#])", "i") };
});

function findSkills(text) {
  const found = new Set();
  for (const m of MATCHERS) if (m.re.test(text)) found.add(m.name);
  // "Go" is also an English verb; only count it when it looks like the language.
  if (found.has("Go") && !/\bgolang\b|\bgo\b\s*(?:,|\/|and|services?|microservices?|backend|developer|engineer|\(|\))|(?:in|with|using|,)\s+go\b/i.test(text)) {
    found.delete("Go");
  }
  return found;
}

function findYears(text) {
  let max = 0;
  const re = /(\d{1,2})\s*\+?\s*(?:years?|yrs?|tahun)/gi;
  let m;
  while ((m = re.exec(text))) max = Math.max(max, Number(m[1]));
  return max;
}

function verdict(score) {
  if (score >= 80) return "Shortlist this one.";
  if (score >= 60) return "Worth an interview.";
  if (score >= 40) return "A stretch, but trainable.";
  return "Not this round.";
}

function chipList(ul, items, empty) {
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "is-empty";
    li.textContent = empty;
    ul.append(li);
    return;
  }
  for (const s of items) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.append(li);
  }
}

export function mount(main, { narrator }) {
  const app = main.querySelector('[data-app="cv-match"]');
  if (!app) return;
  const jd = app.querySelector("#cv-jd");
  const cv = app.querySelector("#cv-cv");
  const status = app.querySelector("[data-status]");
  const result = app.querySelector("[data-result]");
  const ring = app.querySelector("[data-score-ring]");
  const scoreEl = app.querySelector("[data-score]");
  let counter = 0;

  app.querySelector("[data-sample]").addEventListener("click", function () {
    jd.value = SAMPLE_JD;
    cv.value = SAMPLE_CV;
    status.textContent = "Sample loaded. Sari is made up, the skills are real.";
    narrator.say("A sample! Press Score it.");
  });

  app.querySelector("[data-run]").addEventListener("click", function () {
    const jdText = jd.value.trim();
    const cvText = cv.value.trim();
    if (!jdText || !cvText) {
      status.textContent = !jdText ? "Paste a job description first." : "Now paste a CV.";
      (!jdText ? jd : cv).focus();
      return;
    }

    const need = [...findSkills(jdText)];
    if (!need.length) {
      status.textContent = "I couldn't find any skills I know in that job description. Try naming a few tools.";
      narrator.cue({ pose: "read", say: "Hmm. What skills does this job need?" });
      return;
    }
    const has = findSkills(cvText);
    const brings = need.filter(function (s) { return has.has(s); });
    const missing = need.filter(function (s) { return !has.has(s); });
    const extra = [...has].filter(function (s) { return !need.includes(s); });

    const needYears = findYears(jdText);
    const hasYears = findYears(cvText);
    const skillPart = brings.length / need.length;
    const yearPart = needYears ? Math.min(1, hasYears / needYears) : 1;
    const score = Math.round((needYears ? skillPart * 0.8 + yearPart * 0.2 : skillPart) * 100);

    const bits = ["Matches " + brings.length + " of " + need.length + " skills the job asks for."];
    if (needYears) {
      bits.push(hasYears
        ? "The job wants " + needYears + "+ years and the CV shows " + hasYears + "."
        : "The job wants " + needYears + "+ years, but the CV doesn't say how many.");
    }
    if (extra.length) bits.push("Also brings " + extra.slice(0, 4).join(", ") + ".");

    result.hidden = false;
    app.querySelector("[data-verdict]").textContent = verdict(score);
    app.querySelector("[data-summary]").textContent = bits.join(" ");
    chipList(app.querySelector("[data-have]"), brings, "None of the required skills yet.");
    chipList(app.querySelector("[data-miss]"), missing, "Nothing missing. Nice.");
    ring.style.setProperty("--score", "0");
    requestAnimationFrame(function () { ring.style.setProperty("--score", String(score)); });

    const start = performance.now();
    const run = ++counter;
    (function tick(now) {
      if (run !== counter) return;
      const t = Math.min(1, (now - start) / 900);
      scoreEl.textContent = String(Math.round(score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    })(start);

    status.textContent = "Scored " + score + " out of 100. " + verdict(score);
    if (score >= 80) { narrator.say("Ooh, strong match! Call them."); narrator.react("dance"); }
    else if (score >= 60) { narrator.say("Not bad at all. Worth a chat."); narrator.react("wave"); }
    else narrator.cue({ pose: "read", say: "Some gaps here. Check the missing list." });
  });

  return function () { counter++; };
}
