# Animali del golf

I modelli forniti in `duck-animation.zip` e `deer-realistic-3d-model-demo-free.zip` sono convertiti in `src/assets/animals/duck.glb` e `deer.glb` con `node scripts/prepare-golf-animals.mjs`.

Prima della conversione, estrarre l'anatra in `artifacts/golf-animals/duck` e lo ZIP annidato `source/source.zip` del cervo in `artifacts/golf-animals/deer`. Ogni cartella deve contenere `source/` e `textures/`.

La conversione conserva rig e animazioni, applica le texture fornite, elimina i colori dei vertici del modello dimostrativo e ridimensiona le texture a 512 pixel in WebP. Il cervo usa camminata e attesa; l'anatra usa nuoto, decollo e volo. Le pose dipendono dal tempo della simulazione per mantenere coerenti i replay. La sostituzione del cervo vale anche per il ciclismo, che usa lo stesso renderer.

L'evento della volpe e stato rimosso dal golf. Gli archivi originali restano invariati.

Verifica: `npm run check:animals` controlla movimento, scala e ripristino delle pose dopo cambi di animazione e salti nel replay, salvando le immagini in `artifacts/animals/review/`. `npm run build` verifica TypeScript e la build web.
