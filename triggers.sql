\c Xanadu;

--add xp
CREATE OR REPLACE FUNCTION set_user_level() RETURNS TRIGGER AS $level$

  BEGIN

    CASE
      WHEN NEW.xp BETWEEN 0 AND 50 THEN
        NEW.level = 1;
      WHEN NEW.xp BETWEEN 50 AND 150 THEN
        NEW.level = 2;
      WHEN NEW.xp BETWEEN 150 AND 350 THEN
        NEW.level = 3;
      WHEN NEW.xp BETWEEN 350 AND 750 THEN
        NEW.level = 4;
      WHEN NEW.xp BETWEEN 750 AND 1550 THEN
        NEW.level = 5;
      WHEN NEW.xp BETWEEN 1550 AND 3150 THEN
        NEW.level = 6;
      WHEN NEW.xp BETWEEN 3150 AND 6350 THEN
        NEW.level = 7;
      WHEN NEW.xp BETWEEN 6350 AND 12750 THEN
        NEW.level = 8;
      ELSE
        NEW.level = 9;
    END CASE;

    RETURN NEW;
  END;
$level$ LANGUAGE plpgsql;


-- add_commends
CREATE OR REPLACE FUNCTION add_commends() RETURNS TRIGGER AS $$

  BEGIN

  UPDATE Account_skills set commends = commends + 1 WHERE id = NEW.skill;

  RETURN NEW;
  END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER add_commends AFTER INSERT ON votes FOR EACH ROW EXECUTE PROCEDURE add_commends();

CREATE TRIGGER set_user_level BEFORE UPDATE ON account FOR EACH ROW EXECUTE PROCEDURE set_user_level();
