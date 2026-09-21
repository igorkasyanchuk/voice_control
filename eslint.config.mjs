export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: ["tmp/**", "coverage/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "window",
          "sessionStorage",
          "document",
          "navigator",
          "location",
          "customElements",
          "HTMLElement",
          "fetch",
          "URL",
          "CustomEvent",
          "AbortController",
          "setTimeout",
          "clearTimeout",
          "Event",
          "KeyboardEvent",
          "DOMException",
          "Storage",
          "performance",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      eqeqeq: "error",
    },
  },
];
