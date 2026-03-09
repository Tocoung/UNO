// Helper logic for creating flashy animations and particles

export const createParticles = (x, y, color) => {
    const container = document.getElementById('particles-container');
    const count = 20;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.background = color || 'white';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        // Random trajectory
        const angle = Math.random() * Math.PI * 2;
        const velocity = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;

        particle.style.transform = `translate(${tx}px, ${ty}px)`;

        container.appendChild(particle);

        setTimeout(() => {
            particle.remove();
        }, 1000);
    }
};

export const animateCardThrow = (startX, startY, endX, endY, cardElem) => {
    // We use Web Animations API for dynamic bezier curves
    const dx = endX - startX;
    const dy = endY - startY;

    return cardElem.animate([
        { transform: `translate(0, 0) scale(1) rotate(0deg)` },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 50}px) scale(1.2) rotate(180deg)` },
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(360deg)` }
    ], {
        duration: 600,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    });
};

export const shakeElement = (elem) => {
    elem.classList.remove('shake');
    void elem.offsetWidth; // trigger reflow
    elem.classList.add('shake');
};
