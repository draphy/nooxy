// This script is injected into the Notion page and runs on every page load.
window.onload = function () {
  setInterval(() => {
    // Remove all Notion tooltips on images
    const tooltips = document.querySelectorAll('div[style*="position: absolute; top: 4px;"]')
    tooltips.forEach((el) => {
      el.style.display = 'none'
    })

    // Remove hidden properties dropdown
    const propertiesDropdown = document.querySelector('div[aria-label="Page properties"]')?.nextElementSibling

    if (propertiesDropdown) {
      propertiesDropdown.style.display = 'none'
    }
  }, 1000)
}