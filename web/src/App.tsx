import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/Layout";
import { BlogIndex } from "@/pages/blog/BlogIndex";
import { BlogPost } from "@/pages/blog/BlogPost";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";
import { ProjectHost } from "@/pages/ProjectHost";
import { Projects } from "@/pages/Projects";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/blog", element: <BlogIndex /> },
      { path: "/blog/:slug", element: <BlogPost /> },
      { path: "/projects", element: <Projects /> },
      { path: "/projects/:slug", element: <ProjectHost /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
