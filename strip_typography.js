const fs = require('fs');

function stripTypography(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Regex to match tags and extract className string
    const tagRegex = /<(h[1-6]|p|small)\s+className=["']([^"']+)["']/g;

    content = content.replace(tagRegex, (match, tag, classes) => {
        let classArray = classes.split(/\s+/);

        // Filter classes
        classArray = classArray.filter(c => {
            // Keep colors and alignment, remove textual sizing
            if (c.startsWith('text-')) {
                if (c.includes('zinc-') ||
                    c.includes('emerald-') ||
                    c.includes('red-') ||
                    c.includes('white') ||
                    c.includes('amber-') ||
                    c.includes('blue-')) return true;
                if (['text-center', 'text-right', 'text-left', 'text-justify'].includes(c)) return true;
                return false;
            }
            // Remove font weight, family
            if (c.startsWith('font-')) return false;

            // Keep tracking but maybe remove if we rely on new scales? Tracking tighten/widen is fine to keep or remove, let's just remove to be clean, except for uppercase context which uses 'tracking-widest' a lot
            if (c.startsWith('tracking-') && c !== 'tracking-widest') return false;

            // Remove leading
            if (c.startsWith('leading-')) return false;

            return true;
        });

        const newClasses = classArray.join(' ');
        if (newClasses) {
            return `<${tag} className="${newClasses}"`;
        }
        return `<${tag}`;
    });

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Processed', filePath);
}

stripTypography('./src/App.tsx');
stripTypography('./src/components/ManualDataEntry.tsx');
