const importMap = {
  "imports": {
    "react": "https://esm.sh/react@18.2.0?dev",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client?dev",
    "three": "https://esm.sh/three@0.160.0",
    "framer-motion": "https://esm.sh/framer-motion@10.16.4",
    "@phosphor-icons/react": "https://esm.sh/@phosphor-icons/react@2.0.15"
  }
};

const im = document.createElement('script');
im.type = 'importmap';
im.textContent = JSON.stringify(importMap);
document.currentScript.after(im);