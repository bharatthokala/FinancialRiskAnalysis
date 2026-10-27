import config


def get_connection():
    return config.connect()


def fetch_all(query, params=None):
    mydb = get_connection()
    mc = mydb.cursor(dictionary=True)

    try:
        mc.execute(query, params or ())
        result = mc.fetchall()
        return result
    finally:
        mc.close()
        mydb.close()


def execute_query(query, params=None):
    mydb = get_connection()
    mc = mydb.cursor()

    try:
        mc.execute(query, params or ())
        mydb.commit()
        return mc.lastrowid
    except Exception:
        mydb.rollback()
        raise
    finally:
        mc.close()
        mydb.close()