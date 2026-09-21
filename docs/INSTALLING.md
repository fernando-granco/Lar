# Installing Lar

Lar needs Docker Compose and a place on your home network that other household devices can reach.

```bash
git clone https://github.com/fernando-granco/Lar.git
cd Lar
cp .env.example .env
docker compose up -d --build
```

Open `http://YOUR-SERVER:3001`. The first screen helps you add your household.

The database lives in Lar's Docker volume. Use Household → Data to download a full backup before upgrades, and keep that file somewhere safe.

For normal maintenance:

```bash
git pull --ff-only
docker compose build
docker compose up -d --force-recreate
```
