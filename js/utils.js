export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'warning-circle';

    toast.innerHTML = `<i class="ph ph-${icon}" style="color: ${type==='error' ? '#ef4444' : 'var(--primary)'}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}