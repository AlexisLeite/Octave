Octave Notebook 0.1.0

Requisitos:
- Windows 10/11
- Node.js 20 o posterior disponible en PATH
- GNU Octave local. Se detecta desde PATH o instalaciones convencionales; también puede indicarse con -OctavePath.

Instalación:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Destination "C:\Aplicaciones\Octave Notebook"

Inicio:
  .\start.cmd -Port 4310
  .\start.cmd -Port 4310 -OctavePath "C:\Octave\octave-10.2.0\mingw64\bin\octave-cli.exe"

Luego abra http://127.0.0.1:4310. Los cuadernos se guardan en la carpeta projects de la instalación.
