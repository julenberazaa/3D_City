import "./style.css";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app root");

root.innerHTML = `
  <main class="boot">
    <h1>3D City</h1>
    <p class="boot-status">bootstrap</p>
  </main>
`;
