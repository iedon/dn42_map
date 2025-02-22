# DN42 Realtime Network Map

This is the repository for map.dn42 service.

GitHub Action has been depolyed to auto generate latest map data from the GRC(Global Route Collector).

Visit map.dn42: [https://map.dn42/](https://map.dn42/)

> [!NOTE]
> Without having access to DN42, you can also have a try from clearnet: [https://map.iedon.net](https://map.iedon.net)

![DN42 Network Map Screenshot](./screenshot.png)

## Structure

- `pack.js` for generating final single `index.html` artifact after js files bundled by rollup
- `generator` contains binary data generator, which triggers by GitHub Actions to generate latest `.bin` file from the DN42 GRC dump file
- `public` folder contains those static files will be copied to production folder(for this repository, GitHub Pages)
- `src` folder contains frontend project
- `myip` contains what is my IP service customized for map.dn42
- `maphook` contains hook app that used to active & dynamically trigger CI/CD

## Build

```bash
bun run build
```

## Credits

- ```isjerryxiao``` for reference of mrt parser
- ```Nixnodes``` for the original DN42 Map. **Totally rewrited.**
- ```0x7f``` for clearnet
- The DN42 GRC service
