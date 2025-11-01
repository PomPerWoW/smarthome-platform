from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('home', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE home_positionhistory 
            ALTER COLUMN point TYPE geometry(PointZ, 4326) 
            USING ST_Force3D(point);
            
            -- Recreate the GIST spatial index with the new 3D geometry type
            DROP INDEX IF EXISTS home_positionhistory_point_id;
            CREATE INDEX home_positionhistory_point_id ON home_positionhistory USING GIST (point);
            """,
            reverse_sql="""
            -- Revert the spatial index first
            DROP INDEX IF EXISTS home_positionhistory_point_id;
            
            -- Revert to 2D geometry
            ALTER TABLE home_positionhistory 
            ALTER COLUMN point TYPE geometry(Point, 4326);
            
            -- Recreate the GIST spatial index with 2D geometry
            CREATE INDEX home_positionhistory_point_id ON home_positionhistory USING GIST (point);
            """,
        ),
    ]

