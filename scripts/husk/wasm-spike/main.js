import { dotnet } from './_framework/dotnet.js';
const { getAssemblyExports, getConfig } = await dotnet.create();
const e = await getAssemblyExports(getConfig().mainAssemblyName);
globalThis.psInit = () => e.Spike.Init();
globalThis.runPs = (s) => e.Spike.Run(s);
console.log('READY');
