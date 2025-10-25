# 🎯 Git Hooks con Husky

Este proyecto usa **Husky** para validaciones automáticas antes de commits y pushes.

## 📋 **Flujo de Validaciones**

### **Pre-commit** (todas las branches):
```bash
git commit -m "mensaje"
# → Ejecuta automáticamente: npm run lint
```
- ✅ Lint ligero en todos los commits
- 🚫 Bloquea commit si hay errores de lint

### **Pre-push** (solo main branch):
```bash
git push origin main
# → Ejecuta automáticamente: lint + tests + build
```
- ✅ Validación completa solo para main
- ✅ Otras branches (dev, feature/*, etc.) pasan directo
- 🚫 Bloquea push a main si fallan tests/lint/build

### **Branches de desarrollo** (dev, feature/*, etc.):
```bash
git push origin dev
# → Push directo, sin validaciones
```
- ✅ Push inmediato sin esperas
- ✅ Perfecto para desarrollo rápido

---

## 🚀 **Comandos Disponibles**

### **Validación manual para main:**
```bash
npm run validate:main
# Ejecuta: lint + tests + build
```

### **Fix automático de lint:**
```bash
npm run lint:fix
# Corrige automáticamente errores de formato
```

### **Testing:**
```bash
npm test              # Tests completos
npm run test:watch    # Tests en modo watch
npm run test:coverage # Tests con cobertura
```

---

## 🔧 **Configuración de Hooks**

Los hooks están en `.husky/`:
- `.husky/pre-commit` - Lint en todos los commits  
- `.husky/pre-push` - Validación completa solo en main

### **Bypass temporal (emergencias):**
```bash
# Saltar pre-commit
git commit -m "fix: emergency" --no-verify

# Saltar pre-push  
git push origin main --no-verify
```

---

## 🎯 **Flujo Recomendado**

### **Para desarrollo:**
```bash
git checkout -b feature/nueva-funcionalidad
# ... hacer cambios ...
git commit -m "feat: nueva funcionalidad"  # ✅ Solo lint
git push origin feature/nueva-funcionalidad  # ✅ Push directo
```

### **Para production:**
```bash
git checkout main
git merge feature/nueva-funcionalidad
git push origin main  # ✅ Lint + Tests + Build + Deploy
```

---

## 🛠️ **Troubleshooting**

### **Si falla el lint:**
```bash
npm run lint:fix  # Corregir automáticamente
# o manualmente corregir errores
npm run lint      # Verificar
```

### **Si fallan los tests:**
```bash
npm test          # Ver qué tests fallan
# Corregir tests
npm run validate:main  # Verificar todo
```

### **Si falla el build:**
```bash
npm run build     # Ver errores de TypeScript
# Corregir errores de tipos
npm run validate:main  # Verificar todo
```

---

**¡Los hooks de Husky mantienen la calidad del código automáticamente! 🎉**