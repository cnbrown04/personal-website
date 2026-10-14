import { defineProject } from "@site/kit";

export default defineProject({
  slug: "{{slug}}",
  title: "{{title}}",
  description: "Describe this project.",
  tags: [],
  year: {{year}},
  mode: "embedded",
  load: () => import("./src"),
});
