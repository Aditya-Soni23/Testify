// global mobile.js
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarContainer = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    // Toggle function
    function toggleMobileNavigation() {
        sidebarContainer?.classList.toggle('active-mobile');
        sidebarOverlay?.classList.toggle('active-mobile');
    }

    // Attach click events to the button and the dark overlay
    if (mobileMenuBtn && sidebarOverlay && sidebarContainer) {
        mobileMenuBtn.addEventListener('click', toggleMobileNavigation);
        sidebarOverlay.addEventListener('click', toggleMobileNavigation);
    }

    // Auto-close the sidebar when any navigation link is clicked
    const navigationLinks = document.querySelectorAll('.nav-menu li');
    navigationLinks.forEach(link => {
        link.addEventListener('click', () => {
            sidebarContainer?.classList.remove('active-mobile');
            sidebarOverlay?.classList.remove('active-mobile');
        });
    });
});