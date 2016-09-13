docker run -d --name oauth_ons -e POSTGRES_PASSWORD=your_password -e POSTGRES_DB=your_db_name -v $yproject_folder(modify this)/data:/var/lib/postgresql/data  -p 5432:5432 auth_ons
