package sketchobj.stmts;

import java.util.Map;

import constraintfactory.ConstData;
import sketchobj.core.Context;
import sketchobj.core.Type;
import sketchobj.expr.Expression;

public class StmtDoWhile extends Statement {
	Statement body;
	Expression cond;
	int line;

	/** Creates a new while loop. 
	 * @param i */
	public StmtDoWhile(Statement body, Expression cond, int i) {
		this.body = body;
		this.cond = cond;
		this.line = i;
	}

	@Override
	public int size() {
		return body == null ? 0 : body.size();
	}

	/** Returns the loop body. */
	public Statement getBody() {
		return body;
	}

	/** Returns the loop condition. */
	public Expression getCond() {
		return cond;
	}

	@Override
	public ConstData replaceConst(int index) {
		// TODO Auto-generated method stub
		return null;
	}

	@Override
	public Context buildContext(Context ctx) {
		// TODO Auto-generated method stub
		return null;
	}

	@Override
	public Map<String, Type> addRecordStmt(StmtBlock parent, int index, Map<String, Type> m) {
		// TODO Auto-generated method stub
		return null;
	}
}