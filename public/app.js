// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

themeToggle.addEventListener('click', () => {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('portfolio-theme', newTheme);
});

// Load projects
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    const projects = await response.json();

    const container = document.getElementById('projectsContainer');
    container.innerHTML = '';

    projects.forEach(project => {
      const template = document.getElementById('projectCard');
      const clone = template.content.cloneNode(true);

      clone.querySelector('.project-name').textContent = project.name;
      clone.querySelector('.project-description').textContent = project.description;

      const statValues = clone.querySelectorAll('.stat-value');
      statValues[0].textContent = project.changelog.length;
      statValues[1].textContent = project.backlog.length;

      clone.querySelector('.view-btn').addEventListener('click', () => {
        window.location.href = `project.html?id=${project.id}`;
      });

      container.appendChild(clone);
    });
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

// Initialize
loadProjects();
