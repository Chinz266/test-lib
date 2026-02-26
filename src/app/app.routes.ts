import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./capture-flow/capture-flow').then((module) => module.CaptureFlow),
    },
    {
        path: 'location',
        loadComponent: () =>
            import('./location/location').then((module) => module.LocationPage),
    },
    {
        path: 'read-img',
        loadComponent: () =>
            import('./read-img/read-img').then((module) => module.ReadImg),
    },
    {
        path: 'camera',
        loadComponent: () =>
            import('./camera/camera').then((module) => module.Camera),
    },
];
